/**
 * review-tape — ce que l'IA voit dans une self-tape.
 *
 * Modèle : Gemini (clé Google). Le `responseSchema` de l'API force une réponse
 * exploitable, donc pas de parsing au petit bonheur d'un texte libre.
 *
 * Elle reçoit des images clés extraites de la tape (dans le navigateur de la
 * personne qui review : aucun transcodage serveur, aucune vidéo en transit), le
 * rôle et les traits de jeu que la production veut évaluer. Elle rend une note
 * **par trait, avec sa justification**, une adéquation au rôle, des forces et
 * des réserves.
 *
 * Le modèle joue un directeur de casting chevronné — c'est le point : une note
 * chiffrée n'aide personne, un avis argumenté et une suite à donner, si.
 *
 * Quatre règles dans le prompt, et elles comptent plus que le modèle :
 *   · juger le jeu visible, pas le physique de la personne ;
 *   · citer ce qui est vu à l'image pour chaque note ;
 *   · dire « je ne peux pas savoir » plutôt que d'inventer (des images fixes ne
 *     donnent ni la voix ni le rythme) ;
 *   · si les images ne montrent aucun jeu, le dire au lieu de fabriquer des
 *     traits pour avoir quelque chose à noter.
 *
 * Sans `GEMINI_API_KEY`, la fonction répond 503 en le disant : l'app affiche ce
 * message, elle ne fabrique pas d'avis.
 *
 * C'est **la fonction** qui écrit le résultat dans `tape_ai_reviews` (avec la
 * clé service role) : le client crée la ligne en attente et ne peut pas forger
 * un avis.
 */

/** Surchargeable par un secret, pour changer de modèle sans redéployer le code. */
const DEFAULT_MODEL = 'gemini-2.5-flash'

type Body = {
  selfTapeId?: string
  reviewId?: string
  frames?: string[]
  role?: { name?: string; description?: string; instructions?: string }
  traits?: string[]
}

/** Appelée depuis le navigateur du studio : il faut répondre au préflight. */
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

/** Writes the outcome on the pending row — the client never does. */
async function finish(reviewId: string | undefined, patch: Record<string, unknown>) {
  if (!reviewId) return
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  await fetch(`${url}/rest/v1/tape_ai_reviews?id=eq.${reviewId}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...patch, completed_at: new Date().toISOString() }),
  }).catch(() => {})
}

const SYSTEM = `You are a senior casting director with twenty years of credits on
features and high-end series. You have sat through tens of thousands of tapes,
you have cast leads who went on to carry films, and you have been wrong often
enough to be careful. A colleague hands you still frames from a self-tape, the
role, and the traits they want assessed. They want your read — the one you would
give across the table, not a flattering paragraph.

How you work:
- You judge the **acting**: intention, what the eyes are doing, whether the body
  agrees with the face, whether something is happening behind the line or only in
  front of it. You know the difference between an actor *showing* an emotion and
  an actor *having* one, and you say which one you are looking at.
- You never grade a person's looks, ethnicity, body or age. Type is a casting
  fact you may note neutrally against the role; it is never a verdict on them.
- Every score is earned by something visible, and you quote it — "frame 3, the
  jaw sets before the line lands". A score without its evidence is worthless.
- You know what stills cannot carry: voice, rhythm, diction, timing, how they
  take direction. When a trait lives in those, you say so and score it null.
  Guessing would cost your colleague a callback slot.
- If there is nobody on camera — a screen recording, a test pattern, an empty
  room, the wrong file — you say exactly that in one line, score every trait
  null, set fit_score to 0 and recommend "pass". You do not invent traits in
  order to have something to grade. A wrong tape happens; pretending to read it
  is how a casting session gets poisoned.
- But someone weak on camera is still someone to read. If a person is acting and
  it is not working — indicating, pushing, nothing behind the eyes, a camera
  test rather than a scene — you say so in your own words and you still score
  the traits low with the evidence. That read is worth more to your colleague
  than a refusal, because it tells them what they are looking at.
- You are decisive and economical. No hedging, no flattery, no coaching clichés.
  Short sentences. The kind of note that ends an argument in the room.
- You finish like a casting director: what you would do with this person
  (callback, maybe, pass) and the one adjustment you would ask for on a second
  take. If they are wrong for this role but right for another kind of part, say
  it — that is half the job.

Answer with JSON only:
{
  "summary": "two sentences, the read you would say out loud",
  "fit_score": 0-100,
  "traits": [{ "trait": "...", "score": 0-100 or null, "evidence": "what is visible, quoted from a frame" }],
  "strengths": ["..."],
  "risks": ["..."],
  "recommendation": "callback" | "maybe" | "pass",
  "direction": "the one adjustment you would ask for on a second take"
}`

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: Body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) {
    const error =
      'AI review is not connected yet — add GEMINI_API_KEY to this function’s secrets.'
    await finish(body.reviewId, { status: 'failed', error })
    return json({ error }, 503)
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL

  const frames = (body.frames ?? []).filter((frame) => frame.startsWith('data:image/'))
  if (frames.length === 0) {
    await finish(body.reviewId, { status: 'failed', error: 'no frame to look at' })
    return json({ error: 'no frame to look at' }, 400)
  }

  const traits = (body.traits ?? []).filter(Boolean)
  const role = body.role ?? {}

  const parts: unknown[] = frames.map((frame) => ({
    inline_data: {
      mime_type: frame.slice(5, frame.indexOf(';')),
      data: frame.slice(frame.indexOf(',') + 1),
    },
  }))

  parts.push({
    text: [
      `Role: ${role.name ?? 'unnamed'}`,
      role.description ? `Description: ${role.description}` : null,
      role.instructions ? `Self-tape brief: ${role.instructions}` : null,
      traits.length > 0
        ? `Traits to assess: ${traits.join(', ')}`
        : 'Traits to assess: pick the three this role lives or dies on, and name them.',
      `These are ${frames.length} frames sampled across the tape, in order.`,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  // Le schéma force une réponse exploitable : pas de parsing au petit bonheur.
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' },
      fit_score: { type: 'INTEGER' },
      traits: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            trait: { type: 'STRING' },
            score: { type: 'INTEGER', nullable: true },
            evidence: { type: 'STRING' },
          },
          required: ['trait', 'evidence'],
        },
      },
      strengths: { type: 'ARRAY', items: { type: 'STRING' } },
      risks: { type: 'ARRAY', items: { type: 'STRING' } },
      recommendation: { type: 'STRING', enum: ['callback', 'maybe', 'pass'] },
      direction: { type: 'STRING' },
    },
    required: [
      'summary',
      'fit_score',
      'traits',
      'strengths',
      'risks',
      'recommendation',
      'direction',
    ],
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 3072,
          responseMimeType: 'application/json',
          responseSchema,
          // Sans ça, la « réflexion » du modèle consomme tout le budget de
          // sortie et la réponse revient vide : on ne veut pas d'un rapport
          // interne, on veut le JSON.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )

  if (!response.ok) {
    const error = `the model refused the request: ${(await response.text()).slice(0, 300)}`
    await finish(body.reviewId, { status: 'failed', error })
    return json({ error }, 502)
  }

  const payload = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
    promptFeedback?: { blockReason?: string }
  }
  const candidate = payload.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text ?? ''

  if (!text) {
    // Dire *pourquoi* c'est vide : refus de sécurité, budget épuisé, autre.
    const reason =
      payload.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no reason given'
    const error = `the model returned nothing (${reason})`
    await finish(body.reviewId, { status: 'failed', error })
    return json({ error }, 502)
  }

  // The model answers with JSON, but a stray sentence must not break the review.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) {
    const error = 'the model did not answer with JSON'
    await finish(body.reviewId, { status: 'failed', error })
    return json({ error }, 502)
  }

  let review: {
    summary?: string
    fit_score?: number
    traits?: unknown[]
    strengths?: string[]
    risks?: string[]
    recommendation?: string
    direction?: string
  }
  try {
    review = JSON.parse(text.slice(start, end + 1))
  } catch {
    const error = 'the model answered with malformed JSON'
    await finish(body.reviewId, { status: 'failed', error })
    return json({ error }, 502)
  }

  await finish(body.reviewId, {
    status: 'ready',
    model,
    frames: frames.length,
    summary: review.summary ?? null,
    fit_score: typeof review.fit_score === 'number' ? Math.round(review.fit_score) : null,
    traits: review.traits ?? [],
    strengths: review.strengths ?? [],
    risks: review.risks ?? [],
    recommendation: ['callback', 'maybe', 'pass'].includes(review.recommendation ?? '')
      ? review.recommendation
      : null,
    direction: review.direction ?? null,
    error: null,
  })

  return json({ ok: true, model, frames: frames.length, review })
})
