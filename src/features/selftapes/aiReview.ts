import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TapeAiReviewRow } from '@/types/database'

/**
 * L'avis de l'IA sur une tape.
 *
 * Les images clés sont extraites **dans le navigateur** de la personne qui
 * review : la vidéo ne transite pas, rien n'est transcodé côté serveur, et
 * l'analyse coûte six images au lieu d'un fichier de 200 Mo.
 *
 * Le client crée la ligne en attente puis appelle la fonction ; c'est la
 * fonction (clé service role) qui écrit le verdict — un avis d'IA ne peut donc
 * pas être forgé depuis le navigateur.
 */

export const FRAME_COUNT = 6

/** Une analyse laissée en plan (onglet fermé) ne doit pas tourner pour toujours. */
const STALE_AFTER_MS = 3 * 60_000

/**
 * Le dernier avis **abouti** pour cette tape.
 *
 * Une ligne `pending` trop vieille est ignorée : la personne a fermé son
 * onglet, et afficher un spinner éternel serait mentir sur l'état.
 */
export function useAiReview(selfTapeId: string | undefined) {
  return useQuery({
    queryKey: ['tape-ai-review', selfTapeId],
    queryFn: async (): Promise<TapeAiReviewRow | null> => {
      const { data, error } = await supabase
        .from('tape_ai_reviews')
        .select('*')
        .eq('self_tape_id', selfTapeId as string)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error

      const rows = data ?? []
      const settled = rows.find((row) => row.status !== 'pending')
      const fresh = rows.find(
        (row) =>
          row.status === 'pending' &&
          Date.now() - new Date(row.created_at).getTime() < STALE_AFTER_MS,
      )
      return fresh ?? settled ?? null
    },
    enabled: Boolean(selfTapeId),
  })
}

/**
 * Six images réparties sur la durée de la tape.
 *
 * `crossOrigin = 'anonymous'` est indispensable : sans lui le canvas est
 * « teinté » par la vidéo signée et `toDataURL` lève une erreur de sécurité.
 */
export async function extractFrames(url: string, count = FRAME_COUNT): Promise<string[]> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('This tape could not be opened for analysis'))
    setTimeout(() => reject(new Error('This tape took too long to open')), 20_000)
  })

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  if (duration <= 0) throw new Error('This tape has no readable duration')

  const canvas = document.createElement('canvas')
  // 640px de large suffit à lire une expression, et garde la requête légère.
  const scale = Math.min(1, 640 / (video.videoWidth || 640))
  canvas.width = Math.round((video.videoWidth || 640) * scale)
  canvas.height = Math.round((video.videoHeight || 360) * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot read frames')

  const frames: string[] = []
  for (let index = 0; index < count; index += 1) {
    // On évite la toute première et la toute dernière image (souvent noires).
    const at = (duration * (index + 0.5)) / count
    const seeked = await new Promise<boolean>((resolve) => {
      video.onseeked = () => resolve(true)
      video.onerror = () => resolve(false)
      setTimeout(() => resolve(false), 5000)
      video.currentTime = at
    })
    if (!seeked) continue
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push(canvas.toDataURL('image/jpeg', 0.72))
  }

  video.src = ''
  if (frames.length === 0) throw new Error('No frame could be read from this tape')
  return frames
}

export type AiReviewInput = {
  selfTapeId: string
  tapeUrl: string
  traits: string[]
  role: { name?: string; description?: string | null; instructions?: string | null }
}

export function useRequestAiReview(profileId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AiReviewInput): Promise<TapeAiReviewRow> => {
      const { data: pending, error: insertError } = await supabase
        .from('tape_ai_reviews')
        .insert({
          self_tape_id: input.selfTapeId,
          requested_by: profileId as string,
          traits_asked: input.traits,
          status: 'pending',
        })
        .select('*')
        .single()
      if (insertError) throw insertError

      const frames = await extractFrames(input.tapeUrl)

      const { data: session } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-tape`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            reviewId: pending.id,
            selfTapeId: input.selfTapeId,
            frames,
            traits: input.traits,
            role: {
              name: input.role.name,
              description: input.role.description,
              instructions: input.role.instructions,
            },
          }),
        },
      )

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? `The analysis failed (${response.status})`)
      }

      const { data: done } = await supabase
        .from('tape_ai_reviews')
        .select('*')
        .eq('id', pending.id)
        .single()
      return done ?? pending
    },
    onSuccess: (review) => {
      void queryClient.invalidateQueries({ queryKey: ['tape-ai-review', review.self_tape_id] })
    },
  })
}
