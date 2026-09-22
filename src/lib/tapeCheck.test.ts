import { describe, expect, it } from 'vitest'
import { checkTape, framingOf, type TapeMetrics } from './tapeCheck'

const base: TapeMetrics = {
  durationSeconds: 60,
  width: 1080,
  height: 1920,
  brightness: 0.45,
  hasAudio: true,
  bytes: 20_000_000,
}

describe('framingOf', () => {
  it('reads a phone tape as portrait', () => {
    expect(framingOf(1080, 1920)).toBe('portrait')
  })

  it('reads a camera tape as landscape', () => {
    expect(framingOf(1920, 1080)).toBe('landscape')
  })

  it('reads a square crop as square', () => {
    expect(framingOf(1080, 1080)).toBe('square')
  })

  it('says nothing when the size is unknown', () => {
    expect(framingOf(null, null)).toBeNull()
  })
})

describe('checkTape', () => {
  it('gives a clean portrait tape full marks', () => {
    expect(checkTape(base).score).toBe(100)
  })

  it('penalises a landscape tape — self-tapes are watched on a phone', () => {
    const check = checkTape({ ...base, width: 1920, height: 1080 })
    expect(check.framing).toBe('landscape')
    expect(check.items.find((item) => item.key === 'framing')?.ok).toBe(false)
    expect(check.score).toBe(75)
  })

  it('flags a tape that is too dark, with the measured value', () => {
    const check = checkTape({ ...base, brightness: 0.05 })
    const light = check.items.find((item) => item.key === 'light')
    expect(light?.ok).toBe(false)
    expect(light?.detail.brightness).toBe(5)
  })

  it('flags a tape that is too short or too long', () => {
    expect(checkTape({ ...base, durationSeconds: 8 }).items.find((i) => i.key === 'duration')?.ok).toBe(false)
    expect(checkTape({ ...base, durationSeconds: 400 }).items.find((i) => i.key === 'duration')?.ok).toBe(false)
  })

  it('does not punish what it could not measure', () => {
    // The browser could not tell whether there is an audio track.
    const check = checkTape({ ...base, hasAudio: null })
    expect(check.items.find((item) => item.key === 'sound')?.ok).toBeNull()
    expect(check.score).toBe(100)
  })

  it('returns no score at all when nothing could be read', () => {
    expect(
      checkTape({
        durationSeconds: null,
        width: null,
        height: null,
        brightness: null,
        hasAudio: null,
        bytes: 0,
      }).score,
    ).toBeNull()
  })
})
