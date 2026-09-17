import { describe, expect, it } from 'vitest'
import { deadlineLabel, isClosingSoon, relativeTime, statusStepIndex } from './format'

/** Small but user-visible: these strings are read on every casting card. */

describe('deadlineLabel', () => {
  it('says "day" for one day and "days" beyond', () => {
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
    expect(deadlineLabel(inDays(1))).toBe('Closes in 1 day')
    expect(deadlineLabel(inDays(3))).toBe('Closes in 3 days')
  })

  it('counts in hours on the last day', () => {
    const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()
    expect(deadlineLabel(inHours(5))).toBe('Closes in 5h')
  })

  it('reports a past deadline as closed, and no deadline as such', () => {
    expect(deadlineLabel(new Date(Date.now() - 86_400_000).toISOString())).toBe('Closed')
    expect(deadlineLabel(null)).toBe('No deadline')
  })

  it('flags a deadline within three days as closing soon', () => {
    expect(isClosingSoon(new Date(Date.now() + 2 * 86_400_000).toISOString())).toBe(true)
    expect(isClosingSoon(new Date(Date.now() + 9 * 86_400_000).toISOString())).toBe(false)
    expect(isClosingSoon(null)).toBe(false)
  })
})

describe('relativeTime', () => {
  it('reads in minutes, hours then days', () => {
    expect(relativeTime(new Date(Date.now() - 30_000).toISOString())).toBe('just now')
    expect(relativeTime(new Date(Date.now() - 20 * 60_000).toISOString())).toBe('20m ago')
    expect(relativeTime(new Date(Date.now() - 5 * 3_600_000).toISOString())).toBe('5h ago')
    expect(relativeTime(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe('3d ago')
  })
})

describe('statusStepIndex', () => {
  it('places each status on the talent-facing ladder', () => {
    expect(statusStepIndex('submitted')).toBe(0)
    expect(statusStepIndex('shortlisted')).toBe(3)
    expect(statusStepIndex('cast')).toBe(6)
  })

  it('puts terminal states outside the ladder', () => {
    expect(statusStepIndex('not_selected')).toBe(7)
    expect(statusStepIndex('withdrawn')).toBe(7)
  })
})
