/**
 * Self-tape check.
 *
 * What a browser can measure about a video file, and what those measurements
 * mean for a casting director: framing, definition, length, light, sound.
 *
 * It says nothing about the acting — that judgement belongs to a human, or to
 * the AI layer when it has a key. Calling a rule-based score "AI" would be the
 * kind of invented intelligence this project refuses.
 */

export type TapeMetrics = {
  durationSeconds: number | null
  width: number | null
  height: number | null
  /** Mean luminance of a few frames, 0 (black) to 1 (white). */
  brightness: number | null
  /** `null` when the browser cannot answer — never guessed. */
  hasAudio: boolean | null
  bytes: number
}

export type TapeFraming = 'portrait' | 'landscape' | 'square' | null

export type TapeCheckItem = {
  key: 'framing' | 'definition' | 'duration' | 'light' | 'sound'
  ok: boolean | null
  /** Everything needed to write the sentence, without inventing a number. */
  detail: Record<string, string | number | null>
}

export type TapeCheck = {
  metrics: TapeMetrics
  framing: TapeFraming
  items: TapeCheckItem[]
  /** 0–100, weighted from the rules below. Null when nothing could be read. */
  score: number | null
}

export function framingOf(width: number | null, height: number | null): TapeFraming {
  if (!width || !height) return null
  const ratio = width / height
  if (ratio < 0.9) return 'portrait'
  if (ratio > 1.1) return 'landscape'
  return 'square'
}

/**
 * The rules, in the order a casting director reads them. Weights say what
 * actually costs a tape: an unwatchable frame beats a missing second.
 */
const WEIGHTS: Record<TapeCheckItem['key'], number> = {
  framing: 25,
  definition: 25,
  duration: 20,
  light: 20,
  sound: 10,
}

export function checkTape(metrics: TapeMetrics): TapeCheck {
  const framing = framingOf(metrics.width, metrics.height)
  const shortest = Math.min(metrics.width ?? 0, metrics.height ?? 0)

  const items: TapeCheckItem[] = [
    {
      key: 'framing',
      // Self-tapes are watched on a phone: portrait or square, not landscape.
      ok: framing === null ? null : framing !== 'landscape',
      detail: { framing },
    },
    {
      key: 'definition',
      ok: shortest === 0 ? null : shortest >= 720,
      detail: { width: metrics.width, height: metrics.height },
    },
    {
      key: 'duration',
      ok:
        metrics.durationSeconds === null
          ? null
          : metrics.durationSeconds >= 15 && metrics.durationSeconds <= 180,
      detail: { seconds: metrics.durationSeconds === null ? null : Math.round(metrics.durationSeconds) },
    },
    {
      key: 'light',
      ok:
        metrics.brightness === null
          ? null
          : metrics.brightness >= 0.18 && metrics.brightness <= 0.85,
      detail: {
        brightness: metrics.brightness === null ? null : Math.round(metrics.brightness * 100),
      },
    },
    {
      key: 'sound',
      ok: metrics.hasAudio,
      detail: {},
    },
  ]

  // Only the rules that could be measured count, so an undetectable audio track
  // does not silently punish the tape.
  const measured = items.filter((item) => item.ok !== null)
  const total = measured.reduce((sum, item) => sum + WEIGHTS[item.key], 0)
  const earned = measured
    .filter((item) => item.ok)
    .reduce((sum, item) => sum + WEIGHTS[item.key], 0)

  return {
    metrics,
    framing,
    items,
    score: total === 0 ? null : Math.round((earned / total) * 100),
  }
}

/**
 * Reads a video file in the browser: size, duration, and the average light of
 * three frames. Everything it cannot read stays `null`.
 */
export async function measureTape(file: File): Promise<TapeMetrics> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = url

  const metrics: TapeMetrics = {
    durationSeconds: null,
    width: null,
    height: null,
    brightness: null,
    hasAudio: null,
    bytes: file.size,
  }

  try {
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      video.onloadedmetadata = done
      video.onerror = done
      // A file the browser cannot decode must not hang the upload.
      setTimeout(done, 4000)
    })

    if (Number.isFinite(video.duration) && video.duration > 0) {
      metrics.durationSeconds = video.duration
    }
    if (video.videoWidth > 0) {
      metrics.width = video.videoWidth
      metrics.height = video.videoHeight
    }

    // Audio: only Chromium and Firefox answer, each in their own way.
    const probe = video as HTMLVideoElement & {
      mozHasAudio?: boolean
      webkitAudioDecodedByteCount?: number
      audioTracks?: { length: number }
    }
    if (typeof probe.mozHasAudio === 'boolean') metrics.hasAudio = probe.mozHasAudio
    else if (probe.audioTracks) metrics.hasAudio = probe.audioTracks.length > 0
    else if (typeof probe.webkitAudioDecodedByteCount === 'number') {
      metrics.hasAudio = probe.webkitAudioDecodedByteCount > 0
    }

    if (metrics.width && metrics.durationSeconds) {
      metrics.brightness = await meanBrightness(video, metrics.durationSeconds)
    }
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }

  return metrics
}

/** Average luminance of three frames, sampled across the take. */
async function meanBrightness(video: HTMLVideoElement, duration: number): Promise<number | null> {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  canvas.width = 64
  canvas.height = 64
  const samples: number[] = []

  for (const at of [0.2, 0.5, 0.8].map((ratio) => duration * ratio)) {
    const drawn = await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => resolve(ok)
      video.onseeked = () => done(true)
      video.onerror = () => done(false)
      setTimeout(() => done(false), 2000)
      try {
        video.currentTime = at
      } catch {
        done(false)
      }
    })
    if (!drawn) continue

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let sum = 0
      for (let index = 0; index < data.length; index += 4) {
        // Rec. 601 luma — the eye weighs green most.
        sum += (0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]) / 255
      }
      samples.push(sum / (data.length / 4))
    } catch {
      // A cross-origin or undecodable frame taints the canvas: skip it.
    }
  }

  if (samples.length === 0) return null
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}
