import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTapeStills, saveTapeStill, signSelfTapes, type TapeStill } from '@/data/repositories/wall'

/**
 * L'image d'une audition.
 *
 * The Wall™ montre une performance, pas une photo de profil : l'image d'une
 * carte est tirée de la self-tape elle-même. Elle est produite une seule fois,
 * dans le navigateur du premier membre de l'équipe qui en a besoin (la vidéo
 * ne transite par aucun serveur), puis rangée dans le bucket privé
 * `tape-stills` pour toute l'équipe.
 *
 * Choix de l'image : quatre instants entre 20 % et 65 % de la tape — loin de
 * l'ardoise du début et de la fin — et on garde la plus lisible (exposition
 * correcte, contraste, netteté). Si la tape ne peut pas être lue, la carte
 * affiche un fond neutre : jamais une autre image à la place.
 */

const SAMPLE = 64
const MAX_WIDTH = 1280
const POSITIONS = [0.2, 0.35, 0.5, 0.65]

/** Note de lisibilité d'une image (0 = noire ou floue). */
export function frameScore(pixels: Uint8ClampedArray, width: number, height: number): number {
  const luma = new Float32Array(width * height)
  let sum = 0
  for (let i = 0; i < width * height; i += 1) {
    const value = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255
    luma[i] = value
    sum += value
  }
  const mean = sum / luma.length
  let variance = 0
  let edges = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = luma[y * width + x]
      variance += (value - mean) ** 2
      if (x + 1 < width) edges += Math.abs(value - luma[y * width + x + 1])
      if (y + 1 < height) edges += Math.abs(value - luma[(y + 1) * width + x])
    }
  }
  const contrast = Math.sqrt(variance / luma.length)
  const sharpness = edges / luma.length
  // Une image trop sombre ou brûlée ne se rattrape pas par le contraste.
  const exposure = 1 - Math.min(1, Math.abs(mean - 0.48) / 0.4)
  return exposure * (contrast * 2 + sharpness * 6)
}

type Extracted = { blob: Blob; atSeconds: number; width: number; height: number }

async function extractStill(url: string): Promise<Extracted> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('This tape took too long to open')), 20_000)
      video.onloadeddata = () => {
        clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        clearTimeout(timer)
        reject(new Error('This tape could not be opened'))
      }
    })

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('This tape has no picture')

    const sample = document.createElement('canvas')
    sample.width = SAMPLE
    sample.height = Math.max(1, Math.round((SAMPLE * height) / width))
    const sampleContext = sample.getContext('2d', { willReadFrequently: true })
    if (!sampleContext) throw new Error('This browser cannot read frames')

    const times = duration > 0 ? POSITIONS.map((position) => Math.max(0.8, duration * position)) : [0]
    let best = { at: times[0], score: -1 }
    for (const at of times) {
      const seeked = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 6000)
        video.onseeked = () => {
          clearTimeout(timer)
          resolve(true)
        }
        video.currentTime = Math.min(at, Math.max(0, duration - 0.1))
      })
      if (!seeked) continue
      sampleContext.drawImage(video, 0, 0, sample.width, sample.height)
      const { data } = sampleContext.getImageData(0, 0, sample.width, sample.height)
      const score = frameScore(data, sample.width, sample.height)
      if (score > best.score) best = { at: video.currentTime, score }
    }

    if (Math.abs(video.currentTime - best.at) > 0.05) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 6000)
        video.onseeked = () => {
          clearTimeout(timer)
          resolve()
        }
        video.currentTime = best.at
      })
    }

    const scale = Math.min(1, MAX_WIDTH / width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot read frames')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) throw new Error('This frame could not be encoded')
    return { blob, atSeconds: best.at, width, height }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

// ── File d'attente : une tape à la fois, jamais deux fois ───────────────────

const inFlight = new Map<string, Promise<void>>()
const failed = new Set<string>()
let chain: Promise<unknown> = Promise.resolve()

function generate(selfTapeId: string, orgId: string, profileId: string): Promise<void> {
  const existing = inFlight.get(selfTapeId)
  if (existing) return existing
  const job = (chain = chain
    .catch(() => {})
    .then(async () => {
      const urls = await signSelfTapes([selfTapeId])
      const url = urls[selfTapeId]
      if (!url) throw new Error('This tape is not available')
      const still = await extractStill(url)
      await saveTapeStill({ selfTapeId, orgId, profileId, ...still })
    })) as Promise<void>
  const tracked = job
    .catch((error) => {
      failed.add(selfTapeId)
      console.warn('[wall] still', selfTapeId, error)
    })
    .finally(() => inFlight.delete(selfTapeId))
  inFlight.set(selfTapeId, tracked)
  return tracked
}

export type StillState = { status: 'ready'; still: TapeStill } | { status: 'pending' } | { status: 'unavailable' }

/**
 * Les images des tapes demandées. Celles qui manquent sont produites en tâche
 * de fond si `generate` est fourni, puis la liste se recharge.
 */
export function useTapeStills(
  selfTapeIds: (string | null | undefined)[],
  context: { orgId: string | undefined; profileId: string | undefined },
) {
  const ids = useMemo(
    () => [...new Set(selfTapeIds.filter((id): id is string => Boolean(id)))].sort(),
    [selfTapeIds],
  )
  const key = ids.join(',')
  const queryClient = useQueryClient()
  const [tick, setTick] = useState(0)

  const query = useQuery({
    queryKey: ['tape-stills', key],
    queryFn: () => listTapeStills(ids),
    enabled: ids.length > 0,
    // Les URL signées vivent 30 minutes.
    staleTime: 20 * 60_000,
  })

  const { orgId, profileId } = context
  useEffect(() => {
    if (!query.data || !orgId || !profileId) return
    const missing = ids.filter((id) => !query.data[id] && !failed.has(id))
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(missing.map((id) => generate(id, orgId, profileId))).then(() => {
      if (cancelled) return
      setTick((tick) => tick + 1)
      void queryClient.invalidateQueries({ queryKey: ['tape-stills'] })
    })
    return () => {
      cancelled = true
    }
  }, [query.data, ids, orgId, profileId, queryClient])

  return useMemo(() => {
    const states: Record<string, StillState> = {}
    for (const id of ids) {
      const still = query.data?.[id]
      states[id] = still
        ? { status: 'ready', still }
        : failed.has(id) || query.isError
          ? { status: 'unavailable' }
          : { status: 'pending' }
    }
    return states
    // `failed` vit hors de React : `tick` relit l'état après chaque génération.
  }, [ids, query.data, query.isError, tick])
}
