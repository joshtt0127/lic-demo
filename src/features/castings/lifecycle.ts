import type { CastingStatus, RoleStatus } from '@/types/database'
import type { StatusTone } from '@/lib/format'

/**
 * The casting lifecycle, in one place.
 *
 * A role is applyable only while its casting accepts submissions and the role
 * itself is still taking people. Both sides read these rules: the talent must
 * never see an Apply button that cannot work, and the production must see the
 * same words the talent sees.
 */

export const ROLE_STATUSES: RoleStatus[] = ['open', 'reviewing', 'callbacks', 'booked', 'closed']

export const ROLE_STATUS_LABEL: Record<RoleStatus, string> = {
  open: 'Open',
  reviewing: 'To review',
  callbacks: 'Callbacks',
  booked: 'Booked',
  closed: 'Closed',
}

/**
 * How the role's stage reads to a talent (nothing for `open` — the default).
 * Translation keys, not sentences: the talent app is bilingual.
 */
export const ROLE_STAGE_KEY: Record<RoleStatus, string | null> = {
  open: null,
  reviewing: 'lifecycle.stage.reviewing',
  callbacks: 'lifecycle.stage.callbacks',
  booked: 'lifecycle.stage.booked',
  closed: 'lifecycle.stage.closed',
}

export const ROLE_STATUS_TONE: Record<RoleStatus, StatusTone> = {
  open: 'good',
  reviewing: 'maybe',
  callbacks: 'link',
  booked: 'gold',
  closed: 'neutral',
}

export const CASTING_STATUS_KEY: Record<CastingStatus, string> = {
  draft: 'lifecycle.castingStatus.draft',
  published: 'lifecycle.castingStatus.published',
  closed: 'lifecycle.castingStatus.closed',
  archived: 'lifecycle.castingStatus.archived',
}

export type ApplyGate = {
  canApply: boolean
  /**
   * Why not, as a translation key — shown in place of the Apply button, never
   * as a dead button.
   */
  reason: string | null
}

export function applyGate(
  role: { status: RoleStatus },
  casting: { status: CastingStatus; deadline_at: string | null },
  now = new Date(),
): ApplyGate {
  if (casting.status !== 'published') {
    return { canApply: false, reason: 'lifecycle.submissionsClosed' }
  }
  if (role.status === 'booked') return { canApply: false, reason: 'lifecycle.roleCast' }
  if (role.status === 'closed') return { canApply: false, reason: 'lifecycle.roleClosed' }
  if (casting.deadline_at && new Date(casting.deadline_at).getTime() < now.getTime()) {
    return { canApply: false, reason: 'lifecycle.deadlinePassed' }
  }
  return { canApply: true, reason: null }
}
