/**
 * Let It Cast — access control, in one place.
 *
 * Two levels:
 *  1. **Surface** — a profile's `account_type` decides whether it belongs in the
 *     Talent space or in Production (Studio). Used by the route guards.
 *  2. **Capability** — inside an organization, what a member is allowed to do.
 *     Mirrors the RLS policies in `supabase/migrations/*_rls.sql`; the database
 *     stays the source of truth, this is the UI's copy so it can hide what would
 *     be refused anyway.
 *
 * Rule: no `if (user.type === …)` scattered across components — everything goes
 * through `canAccessSurface()` / `can()`.
 */

import type { AccountType, OrgRole, ProfileRow } from '@/types/database'

export type Surface = 'talent' | 'studio'

/** Where each account type lives once onboarded. */
export const SURFACE_HOME: Record<AccountType, string> = {
  talent: '/talent',
  production: '/studio',
}

export const SURFACE_OF: Record<AccountType, Surface> = {
  talent: 'talent',
  production: 'studio',
}

export function isOnboarded(profile: ProfileRow | null | undefined): boolean {
  return Boolean(profile?.account_type && profile.onboarding_completed_at)
}

/**
 * The route a signed-in user should land on:
 * no account type → the "How are you using Let It Cast?" step,
 * onboarding unfinished → back into the wizard, otherwise their home surface.
 */
export function homeRouteFor(profile: ProfileRow | null | undefined): string {
  if (!profile?.account_type) return '/onboarding'
  if (!profile.onboarding_completed_at) return '/onboarding'
  return SURFACE_HOME[profile.account_type]
}

export function canAccessSurface(
  profile: ProfileRow | null | undefined,
  surface: Surface,
): boolean {
  if (!profile?.account_type) return false
  return SURFACE_OF[profile.account_type] === surface
}

// ── Organization capabilities ────────────────────────────────────────────────

export type Capability =
  | 'org:manage'
  | 'org:invite'
  | 'project:create'
  | 'project:edit'
  | 'project:delete'
  | 'casting:create'
  | 'casting:publish'
  | 'role:manage'
  | 'candidate:review'
  | 'candidate:decide'
  | 'candidate:note'
  | 'message:send'

const OWNER: Capability[] = [
  'org:manage',
  'org:invite',
  'project:create',
  'project:edit',
  'project:delete',
  'casting:create',
  'casting:publish',
  'role:manage',
  'candidate:review',
  'candidate:decide',
  'candidate:note',
  'message:send',
]

/** Everything an org role may do. Keep aligned with the RLS policies. */
export const CAPABILITIES: Record<OrgRole, Capability[]> = {
  owner: OWNER,
  admin: OWNER,
  casting_director: [
    'org:invite',
    'project:create',
    'project:edit',
    'casting:create',
    'casting:publish',
    'role:manage',
    'candidate:review',
    'candidate:decide',
    'candidate:note',
    'message:send',
  ],
  member: ['candidate:review', 'candidate:note', 'message:send'],
  viewer: [],
}

export function can(role: OrgRole | null | undefined, capability: Capability): boolean {
  if (!role) return false
  return CAPABILITIES[role].includes(capability)
}

/** Human label for an org role (i18n-ready: keys, not sentences). */
export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  casting_director: 'Casting director',
  member: 'Member',
  viewer: 'Viewer',
}

/** Full name of a profile, with a sensible fallback. */
export function displayName(profile: ProfileRow | null | undefined): string {
  if (!profile) return ''
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return name || 'Your profile'
}
