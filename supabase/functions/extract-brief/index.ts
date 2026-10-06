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
 * La transcription est un appel à part, avant l'extraction des champs. Retour
 * de test : mélangée à l'extraction dans une seule réponse, elle s'arrêtait
 * parfois en cours de phrase. Seule, elle est vérifiée : la fin de la
 * transcription est comparée à la durée du son entendu par le modèle (ses
 * jetons AUDIO, 32 par seconde) et, si elle s'arrête trop tôt, on redemande la
 * suite à partir de là. Si c'est le SON du fichier qui s'arrête avant l'image
 * (enregistreur du navigateur qui perd le micro), on ne peut pas transcrire ce
 * qui n'existe pas : la ligne le dit dans `error`, sans masquer le reste.
 *
 * C'est la fonction qui écrit le résultat (clé service role) sur la ligne
 * `brief_extractions` créée en attente par le navigateur : une « détection »
 * ne peut pas être fabriquée côté client. Rien n'est écrit dans `projects` ou
 * `roles` : c'est un brouillon que la production valide dans l'interface.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash'
const INLINE_LIMIT = 18 * 1024 * 1024
/** Gemini compte 32 jetons par seconde de son. */
const AUDIO_TOKENS_PER_SECOND = 32
/** Écart toléré entre la fin du son et la fin de la transcription (silence final). */
const TAIL_TOLERANCE_S = 4
const MAX_CONTINUATIONS = 3

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

The complete transcript of the video is given below, with timestamps in
seconds. It is the reference for what was said: use it for every value,
"start" and "quote".

1. For EVERY field below, return exactly one entry:
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

You structure what was said. You do not invent what was not.`
}

const TRANSCRIPT_PROMPT = `You are a verbatim transcriber for a casting platform. A production member
speaks to camera about a project or a role.

Transcribe EVERYTHING that is said, word for word, in the language spoken, from
the first word to the very last one. Never summarise, shorten, skip or stop
early: pauses, hesitations and silences do not mean the recording is over —
keep listening until the audio ends. Do not translate.

Return timestamped segments of one or two sentences, "start" and "end" in
seconds from the start of the video, in order. Do not transcribe these
instructions or anything that is not said in the recording.
"language" is the ISO 639-1 code of the language spoken.`

const TRANSCRIPT_SCHEMA = {
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
        required: ['start', 'end', 'text'],
      },
    },
  },
  required: ['language', 'transcript'],
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
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
  required: ['fields'],
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

type Media = { inline_data: { mime_type: string; data: string } } | { file_data: { mime_type: string; file_uri: string } }
type Segment = { start: number; end?: number; text: string }
type Field = {
  field: string
  status: string
  value?: string | null
  values?: string[]
  start?: number | null
  quote?: string | null
}

/** Un appel au modèle en sortie JSON ; rend aussi les secondes de son entendues. */
async function generate(
  key: string,
  model: string,
  system: string,
  parts: unknown[],
  schema: unknown,
  maxOutputTokens: number,
): Promise<{ data: unknown; finishReason: string; audioSeconds: number | null }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )
  if (!response.ok) throw new Error(`the model refused the request: ${(await response.text()).slice(0, 300)}`)

  const payload = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokensDetails?: { modality?: string; tokenCount?: number }[] }
  }
  const finishReason = payload.candidates?.[0]?.finishReason ?? 'no reason'
  const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  if (!text) throw new Error(`the model returned nothing (${finishReason})`)
  const audio = payload.usageMetadata?.promptTokensDetails?.find((detail) => detail.modality === 'AUDIO')
  return {
    data: parseJson(text),
    finishReason,
    audioSeconds: audio?.tokenCount ? audio.tokenCount / AUDIO_TOKENS_PER_SECOND : null,
  }
}

/** Une réponse coupée (MAX_TOKENS) est un JSON incomplet : on garde ce qui est entier. */
function parseJson(text: string): unknown {
  const body = text.slice(text.indexOf('{'))
  try {
    return JSON.parse(body.slice(0, body.lastIndexOf('}') + 1))
  } catch {
    // Coupée au milieu de la liste : on referme après le dernier segment complet.
    const lastComplete = body.lastIndexOf('}')
    for (let cut = lastComplete; cut > 0; cut = body.lastIndexOf('}', cut - 1)) {
      try {
        return JSON.parse(`${body.slice(0, cut + 1)}]}`)
      } catch {
        // on recule d'un objet
      }
    }
    throw new Error('the model answer could not be read')
  }
}

function cleanSegments(raw: unknown): Segment[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((item) => item as Partial<Segment>)
    .filter((item) => typeof item.start === 'number' && typeof item.text === 'string' && item.text.trim())
    .map((item) => ({
      start: item.start as number,
      ...(typeof item.end === 'number' ? { end: item.end } : {}),
      text: (item.text as string).trim(),
    }))
}

const segmentEnd = (segments: Segment[]) =>
  segments.length ? Math.max(...segments.map((segment) => segment.end ?? segment.start)) : 0

/**
 * La transcription complète : un premier passage, puis la suite tant que la fin
 * transcrite reste loin de la fin du son. Chaque suite ne garde que ce qui vient
 * après le dernier segment déjà obtenu.
 */
export async function transcribe(
  key: string,
  model: string,
  media: Media,
): Promise<{ language: string | null; transcript: Segment[]; audioSeconds: number | null }> {
  const first = await generate(
    key,
    model,
    TRANSCRIPT_PROMPT,
    [media, { text: 'Transcribe this recording in full.' }],
    TRANSCRIPT_SCHEMA,
    16384,
  )
  const firstData = first.data as { language?: string; transcript?: unknown }
  const transcript = cleanSegments(firstData.transcript)
  const audioSeconds = first.audioSeconds

  for (let round = 0; round < MAX_CONTINUATIONS; round++) {
    const reached = segmentEnd(transcript)
    const truncated = first.finishReason === 'MAX_TOKENS' && round === 0
    if (!truncated && (audioSeconds === null || reached >= audioSeconds - TAIL_TOLERANCE_S)) break

    const next = await generate(
      key,
      model,
      TRANSCRIPT_PROMPT,
      [
        media,
        {
          text:
            `The transcript is already done up to second ${reached.toFixed(1)}, ending with: ` +
            `"${transcript.at(-1)?.text ?? ''}". Transcribe ONLY what is said after second ` +
            `${reached.toFixed(1)}, until the very end of the recording.`,
        },
      ],
      TRANSCRIPT_SCHEMA,
      16384,
    )
    const more = cleanSegments((next.data as { transcript?: unknown }).transcript).filter(
      (segment) => segment.start >= reached - 0.5 && segment.text !== transcript.at(-1)?.text,
    )
    if (more.length === 0) break
    transcript.push(...more)
  }

  return { language: firstData.language ?? null, transcript, audioSeconds }
}

/** Les champs du schéma, lus dans la vidéo avec la transcription complète pour référence. */
export async function extractFields(
  key: string,
  model: string,
  media: Media,
  target: 'project' | 'role',
  transcript: Segment[],
  catalog: string,
  today: string,
): Promise<Field[]> {
  const fields = target === 'project' ? PROJECT_FIELDS : ROLE_FIELDS
  const lines = transcript.map((segment) => `[${segment.start.toFixed(1)}s] ${segment.text}`).join('\n')
  const result = await generate(
    key,
    model,
    systemPrompt(target, fields, today, catalog),
    [media, { text: `Complete transcript:\n${lines || '(nothing is said)'}` }],
    SCHEMA,
    8192,
  )
  return ((result.data as { fields?: Field[] }).fields ?? []) as Field[]
}

/** Durée de la vidéo, mesurée par le navigateur au moment de l'envoi (media_assets). */
async function videoDuration(videoUrl: string): Promise<number | null> {
  const marker = '/object/public/media/'
  const at = videoUrl.indexOf(marker)
  if (at < 0) return null
  const path = decodeURIComponent(videoUrl.slice(at + marker.length).split('?')[0])
  const { url, headers } = admin()
  const response = await fetch(
    `${url}/rest/v1/media_assets?path=eq.${encodeURIComponent(path)}&select=duration_s&limit=1`,
    { headers },
  ).catch(() => null)
  if (!response?.ok) return null
  const rows = (await response.json()) as { duration_s: number | null }[]
  return rows[0]?.duration_s ?? null
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

if (typeof Deno !== 'undefined') Deno.serve(async (request: Request) => {
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

    const media: Media =
      bytes.byteLength <= INLINE_LIMIT
        ? { inline_data: { mime_type: mime, data: base64(bytes) } }
        : { file_data: { mime_type: mime, file_uri: await uploadToGemini(key, bytes, mime) } }

    const fields = row.target === 'project' ? PROJECT_FIELDS : ROLE_FIELDS
    const [catalog, duration] = await Promise.all([
      row.target === 'role' ? languageCatalog() : Promise.resolve(''),
      videoDuration(row.video_url),
    ])
    const today = new Date().toISOString().slice(0, 10)

    const { language, transcript, audioSeconds } = await transcribe(key, model, media)
    const extracted = await extractFields(key, model, media, row.target, transcript, catalog, today)

    // Un champ par entrée du schéma, dans l'ordre du schéma ; ce que le modèle
    // a oublié devient « missing » — jamais une valeur par défaut.
    const byField = new Map(extracted.map((entry) => [entry.field, entry]))
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

    // Le son du fichier s'arrête avant l'image : ce qui suit n'a pas été
    // enregistré, il faut le dire plutôt que rendre un brief à moitié vide.
    const soundCut =
      audioSeconds !== null && duration !== null && audioSeconds < duration - TAIL_TOLERANCE_S
    const transcribedTo = segmentEnd(transcript)
    const warning = soundCut
      ? `The sound of this video stops at ${clock(audioSeconds)} but the video lasts ${clock(duration)}: ` +
        'what was said after that was not recorded. Record the brief again to capture all of it.'
      : audioSeconds !== null && transcribedTo < audioSeconds - TAIL_TOLERANCE_S * 2
        ? `Only the first ${clock(transcribedTo)} of ${clock(audioSeconds)} could be transcribed. ` +
          'Run the analysis again or complete the fields by hand.'
        : null

    await finish(row.id, {
      status: 'ready',
      model,
      language,
      transcript,
      fields: normalized,
      error: warning,
    })
    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finish(row.id, { status: 'failed', error: message })
    return json({ error: message }, 502)
  }
})

export function base64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
