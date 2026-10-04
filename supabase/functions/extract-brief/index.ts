/**
 * extract-brief — Video-to-Structured Casting (Brief Once. Launch Everywhere™).
 *
 * Une production enregistre son brief au lieu de taper le formulaire. Cette
 * fonction écoute la vidéo et rend :
 *   1. la transcription minutée (pour la traçabilité vidéo ↔ texte ↔ champ) ;
 *   2. pour CHAQUE champ du schéma Let It Cast de la cible (projet ou rôle),
 *      un statut :
 *        detected  — dit explicitement dans le brief ;
 *        suggested — déduit, à confirmer (« le printemps prochain » → une date) ;
 *        missing   — non dit : la valeur reste VIDE, jamais inventée.
 *      avec le minutage et la phrase d'où vient l'information.
 *
 * Pas d'étape séparée « extraction audio » : Gemini lit la vidéo et sa piste
 * son directement. Au-delà de 18 Mo, la vidéo passe par l'API Files (envoi
 * puis attente de l'état ACTIVE) au lieu d'être incluse dans la requête.
 *
 * C'est la fonction qui écrit le résultat (clé service role) sur la ligne
 * `brief_extractions` créée en attente par le navigateur : une « détection »
 * ne peut pas être fabriquée côté client. Rien n'est écrit dans `projects` ou
 * `roles` : c'est un brouillon que la production valide dans l'interface.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash'
const INLINE_LIMIT = 18 * 1024 * 1024

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const PROJECT_FIELDS = [
  'title',
  'production_type',
  'genre',
  'synopsis',
  'director_brief',
  'company_name',
  'director_name',
  'shooting_location',
  'shooting_start',
  'shooting_end',
  'casting_title',
  'casting_description',
  'auditions_location',
  'deadline',
  'compensation',
] as const

const ROLE_FIELDS = [
  'name',
  'description',
  'role_type',
  'gender_pref',
  'playing_age_min',
  'playing_age_max',
  'location',
  'languages',
  'skills',
  'selftape_instructions',
  'requirements',
  'compensation',
] as const

const FIELD_GUIDE: Record<string, string> = {
  title: 'project title',
  production_type:
    'one of: Film, TV series, Short film, Commercial, Music video, Theatre, Reality TV, Documentary, Voice over',
  genre: 'genre / universe in a few words (e.g. "Psychological thriller")',
  synopsis: 'what the project is about, 1-4 sentences, in the speaker\'s own terms',
  director_brief: 'tone, intention, what matters — the spirit the production wants to convey',
  company_name: 'production company',
  director_name: 'director',
  shooting_location: 'where it shoots',
  shooting_start: 'shooting start date, YYYY-MM-DD',
  shooting_end: 'shooting end date, YYYY-MM-DD',
  casting_title: 'a title for the casting call (only if the speaker names one)',
  casting_description: 'general submission instructions and what talents should know before applying',
  auditions_location: 'where auditions / callbacks happen',
  deadline: 'application deadline, YYYY-MM-DD',
  compensation: 'pay / rate / deal, as said',
  name: 'role / character name',
  description: 'who the character is, 1-3 sentences',
  role_type: 'one of: lead, supporting, contestant',
  gender_pref: 'one of: Female, Male, Non-binary (only if stated)',
  playing_age_min: 'lower playing age, integer',
  playing_age_max: 'upper playing age, integer',
  location: 'where the talent must be based or available',
  languages: 'languages required — use the provided catalog codes in "values"',
  skills: 'skills required (accent work, stunts, singing, horse riding…) in "values"',
  selftape_instructions: 'what the self-tape must contain, format, technical requirements',
  requirements: 'other objective requirements (availability, eligibility, nudity, visas…)',
}

function systemPrompt(target: 'project' | 'role', fields: readonly string[], today: string, catalog: string) {
  return `You turn a casting brief recorded on video into structured data for Let It Cast,
a casting platform. A production member (casting director, producer, director…)
speaks to camera about a ${target === 'project' ? 'project and its casting call' : 'single role'}.

Today is ${today}.

1. Transcribe what is said, in the language spoken, as timestamped segments
   (seconds from the start of the video). Keep the speaker's words.

2. For EVERY field below, return exactly one entry:
${fields.map((f) => `   - ${f}: ${FIELD_GUIDE[f]}`).join('\n')}

   status:
   - "detected": stated explicitly in the brief. value = what was said, cleaned up.
   - "suggested": not stated word for word but clearly implied, or needs
     interpretation (a relative date resolved against today, a type inferred
     from context). value = your best reading, to be confirmed by a human.
   - "missing": not in the brief. value = null, values = []. NEVER invent a
     plausible value — a missing deadline or fee stays missing.
   start = the second where the evidence is said (null when missing).
   quote = the exact words from the transcript that support it (null when missing).
   For list fields (languages, skills) put the items in "values" and leave value null.
${target === 'role' ? `   Language catalog (code = name): ${catalog}\n   For "languages", return catalog CODES only.` : ''}
   Write field values in the language the platform uses: English, except proper
   names and quotes. Dates as YYYY-MM-DD. Ages as integers.

3. "language": the ISO 639-1 code of the language spoken.

You structure what was said. You do not invent what was not.`
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          start: { type: 'NUMBER' },
          end: { type: 'NUMBER' },
          text: { type: 'STRING' },
        },
        required: ['start', 'text'],
      },
    },
    fields: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          field: { type: 'STRING' },
          status: { type: 'STRING', enum: ['detected', 'suggested', 'missing'] },
          value: { type: 'STRING', nullable: true },
          values: { type: 'ARRAY', items: { type: 'STRING' } },
          start: { type: 'NUMBER', nullable: true },
          quote: { type: 'STRING', nullable: true },
        },
        required: ['field', 'status'],
      },
    },
  },
  required: ['language', 'transcript', 'fields'],
}

type Row = { id: string; target: 'project' | 'role'; video_url: string; status: string }

function admin() {
  const url = Deno.env.get('SUPABASE_URL') as string
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  return { url, headers }
}

async function readRow(id: string): Promise<Row | null> {
  const { url, headers } = admin()
  const response = await fetch(
    `${url}/rest/v1/brief_extractions?id=eq.${id}&select=id,target,video_url,status`,
    { headers },
  )
  if (!response.ok) return null
  const rows = (await response.json()) as Row[]
  return rows[0] ?? null
}

async function finish(id: string, patch: Record<string, unknown>) {
  const { url, headers } = admin()
  await fetch(`${url}/rest/v1/brief_extractions?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, completed_at: new Date().toISOString() }),
  }).catch(() => {})
}

async function languageCatalog(): Promise<string> {
  const { url, headers } = admin()
  const response = await fetch(`${url}/rest/v1/languages?select=code,name&order=name`, { headers })
  if (!response.ok) return ''
  const rows = (await response.json()) as { code: string; name: string }[]
  return rows.map((row) => `${row.code}=${row.name}`).join(', ')
}

/** Envoie la vidéo à l'API Files de Gemini et attend qu'elle soit lisible. */
async function uploadToGemini(key: string, bytes: Uint8Array, mime: string): Promise<string> {
  const start = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': mime,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'casting-brief' } }),
    },
  )
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!start.ok || !uploadUrl) throw new Error(`file upload refused (${start.status})`)

  const done = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  })
  if (!done.ok) throw new Error(`file upload failed (${done.status})`)
  const file = ((await done.json()) as { file?: { name?: string; uri?: string; state?: string } }).file
  if (!file?.name || !file.uri) throw new Error('file upload returned no file')

  // La vidéo doit être « ACTIVE » avant d'être lue (traitement côté Google).
  let state = file.state
  for (let attempt = 0; state === 'PROCESSING' && attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`)
    state = ((await poll.json()) as { state?: string }).state
  }
  if (state !== 'ACTIVE') throw new Error(`the video could not be processed (${state ?? 'unknown'})`)
  return file.uri
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405)

  let extractionId: string | undefined
  try {
    extractionId = ((await request.json()) as { extractionId?: string }).extractionId
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (!extractionId) return json({ error: 'extractionId is required' }, 400)

  const row = await readRow(extractionId)
  if (!row) return json({ error: 'unknown extraction' }, 404)
  if (row.status !== 'pending') return json({ error: 'already processed' }, 409)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) {
    const error = 'Brief extraction is not connected — add GEMINI_API_KEY to the function secrets.'
    await finish(row.id, { status: 'failed', error })
    return json({ error }, 503)
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL

  try {
    const video = await fetch(row.video_url)
    if (!video.ok) throw new Error(`the video could not be read (${video.status})`)
    const mime = (video.headers.get('content-type') ?? 'video/webm').split(';')[0]
    const bytes = new Uint8Array(await video.arrayBuffer())

    const media =
      bytes.byteLength <= INLINE_LIMIT
        ? { inline_data: { mime_type: mime, data: base64(bytes) } }
        : { file_data: { mime_type: mime, file_uri: await uploadToGemini(key, bytes, mime) } }

    const fields = row.target === 'project' ? PROJECT_FIELDS : ROLE_FIELDS
    const catalog = row.target === 'role' ? await languageCatalog() : ''
    const today = new Date().toISOString().slice(0, 10)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(row.target, fields, today, catalog) }] },
          contents: [{ role: 'user', parts: [media, { text: 'Here is the brief.' }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
    if (!response.ok) throw new Error(`the model refused the request: ${(await response.text()).slice(0, 300)}`)

    const payload = (await response.json()) as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
    }
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!text) throw new Error(`the model returned nothing (${payload.candidates?.[0]?.finishReason ?? 'no reason'})`)

    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
      language?: string
      transcript?: { start: number; end?: number; text: string }[]
      fields?: {
        field: string
        status: string
        value?: string | null
        values?: string[]
        start?: number | null
        quote?: string | null
      }[]
    }

    // Un champ par entrée du schéma, dans l'ordre du schéma ; ce que le modèle
    // a oublié devient « missing » — jamais une valeur par défaut.
    const byField = new Map((parsed.fields ?? []).map((entry) => [entry.field, entry]))
    const normalized = fields.map((field) => {
      const entry = byField.get(field)
      const values = (entry?.values ?? []).map((v) => String(v).trim()).filter(Boolean)
      const value = entry?.value != null && String(entry.value).trim() ? String(entry.value).trim() : null
      const empty = value === null && values.length === 0
      const status = !entry || empty ? 'missing' : entry.status === 'detected' ? 'detected' : 'suggested'
      return {
        field,
        status,
        value: status === 'missing' ? null : value,
        values: status === 'missing' ? [] : values,
        start: status === 'missing' || typeof entry?.start !== 'number' ? null : entry.start,
        quote: status === 'missing' ? null : (entry?.quote ?? null),
      }
    })

    await finish(row.id, {
      status: 'ready',
      model,
      language: parsed.language ?? null,
      transcript: parsed.transcript ?? [],
      fields: normalized,
      error: null,
    })
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finish(row.id, { status: 'failed', error: message })
    return json({ error: message }, 502)
  }
})

function base64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
