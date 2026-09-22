import { describe, expect, it } from 'vitest'
import { applyGate } from './lifecycle'

const now = new Date('2026-09-18T12:00:00Z')

describe('applyGate', () => {
  it('lets a talent apply to an open role of a published casting', () => {
    expect(
      applyGate({ status: 'open' }, { status: 'published', deadline_at: null }, now),
    ).toEqual({ canApply: true, reason: null })
  })

  it('closes the door once the production closes submissions', () => {
    const gate = applyGate({ status: 'open' }, { status: 'closed', deadline_at: null }, now)
    expect(gate.canApply).toBe(false)
    expect(gate.reason).toBe('lifecycle.submissionsClosed')
  })

  it('says the role is cast rather than showing a dead Apply button', () => {
    expect(
      applyGate({ status: 'booked' }, { status: 'published', deadline_at: null }, now).reason,
    ).toBe('lifecycle.roleCast')
  })

  it('refuses a role whose deadline has passed', () => {
    expect(
      applyGate(
        { status: 'open' },
        { status: 'published', deadline_at: '2026-09-17T23:59:00Z' },
        now,
      ).canApply,
    ).toBe(false)
  })

  it('still accepts a deadline later today', () => {
    expect(
      applyGate(
        { status: 'open' },
        { status: 'published', deadline_at: '2026-09-18T23:59:00Z' },
        now,
      ).canApply,
    ).toBe(true)
  })

  it('keeps a role in review or callbacks applyable — that is the production call', () => {
    for (const status of ['reviewing', 'callbacks'] as const) {
      expect(
        applyGate({ status }, { status: 'published', deadline_at: null }, now).canApply,
      ).toBe(true)
    }
  })
})
