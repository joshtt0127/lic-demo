import { supabase } from '@/lib/supabase'
import type {
  OrganizationInviteRow,
  OrganizationMemberRow,
  OrganizationRow,
  OrgRole,
  ProfileRow,
} from '@/types/database'

/**
 * Organizations — the production side's team container. A production account
 * without one cannot own a project, so the onboarding creates it.
 */

export type OrganizationWithRole = OrganizationRow & { role: OrgRole }

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  // A short suffix keeps two "A24" teams from colliding on the unique slug.
  const suffix = Math.random().toString(16).slice(2, 6)
  return `${base || 'team'}-${suffix}`
}

export type OrganizationInput = {
  name: string
  companyType?: string | null
  city?: string | null
  country?: string | null
  website?: string | null
  description?: string | null
  logoUrl?: string | null
}

/** Creates the organization and makes the caller its owner. */
export async function createOrganization(
  profileId: string,
  input: OrganizationInput,
): Promise<OrganizationRow> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name.trim(),
      slug: slugify(input.name),
      company_type: input.companyType ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      website: input.website ?? null,
      description: input.description ?? null,
      logo_url: input.logoUrl ?? null,
      created_by: profileId,
    })
    .select('*')
    .single()
  if (error) throw error

  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({ org_id: data.id, profile_id: profileId, role: 'owner', status: 'active' })
  if (memberError) throw memberError

  return data
}

/** Organizations the caller belongs to, with their role in each. */
export async function listMyOrganizations(profileId: string): Promise<OrganizationWithRole[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, status, organizations(*)')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  if (error) throw error

  type Joined = Pick<OrganizationMemberRow, 'role' | 'status'> & { organizations: OrganizationRow | null }
  return ((data ?? []) as unknown as Joined[])
    .filter((row) => row.organizations)
    .map((row) => ({ ...(row.organizations as OrganizationRow), role: row.role }))
}

/** Invitations waiting for this email address (RLS exposes only your own). */
export async function listMyInvites(): Promise<(OrganizationInviteRow & { organization: OrganizationRow | null })[]> {
  const { data, error } = await supabase
    .from('organization_invites')
    .select('*, organizations(*)')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())

  if (error) throw error

  type Joined = OrganizationInviteRow & { organizations: OrganizationRow | null }
  return ((data ?? []) as unknown as Joined[]).map(({ organizations, ...invite }) => ({
    ...invite,
    organization: organizations,
  }))
}

/** Joins the organization an invite points to. */
export async function acceptInvite(
  profileId: string,
  invite: OrganizationInviteRow,
): Promise<void> {
  const { error } = await supabase
    .from('organization_members')
    .insert({ org_id: invite.org_id, profile_id: profileId, role: invite.role, status: 'active' })
  if (error) throw error

  const { error: inviteError } = await supabase
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)
  if (inviteError) throw inviteError
}

export async function updateOrganization(
  id: string,
  patch: Partial<Pick<OrganizationRow, 'name' | 'logo_url' | 'description' | 'website' | 'company_type' | 'city' | 'country'>>,
): Promise<OrganizationRow> {
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ── Members & invitations (production side, admin only by RLS) ───────────────

export type OrganizationMemberWithProfile = OrganizationMemberRow & {
  profile: Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url' | 'city'> | null
  jobTitle: string | null
}

export async function listOrgMembers(orgId: string): Promise<OrganizationMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      *,
      profiles ( id, first_name, last_name, avatar_url, city ),
      production_profiles:profiles!inner ( production_profiles ( job_title ) )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    // The nested production_profiles join is a convenience; fall back to the
    // plain member list rather than failing the page.
    const plain = await supabase
      .from('organization_members')
      .select('*, profiles ( id, first_name, last_name, avatar_url, city )')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (plain.error) throw plain.error
    type PlainJoin = OrganizationMemberRow & {
      profiles: OrganizationMemberWithProfile['profile']
    }
    return ((plain.data ?? []) as unknown as PlainJoin[]).map(({ profiles, ...member }) => ({
      ...member,
      profile: profiles,
      jobTitle: null,
    }))
  }

  type Joined = OrganizationMemberRow & {
    profiles: OrganizationMemberWithProfile['profile']
    production_profiles?: { production_profiles: { job_title: string | null } | null } | null
  }

  return ((data ?? []) as unknown as Joined[]).map(({ profiles, production_profiles, ...member }) => ({
    ...member,
    profile: profiles,
    jobTitle: production_profiles?.production_profiles?.job_title ?? null,
  }))
}

export async function listOrgInvites(orgId: string): Promise<OrganizationInviteRow[]> {
  const { data, error } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Creates the invitation row. No email is sent from the browser: the caller
 * gets the link to share, which is what a POC can honestly do.
 */
export async function createInvite(input: {
  orgId: string
  email: string
  role: OrgRole
  invitedBy: string
}): Promise<OrganizationInviteRow> {
  const { data, error } = await supabase
    .from('organization_invites')
    .upsert(
      {
        org_id: input.orgId,
        email: input.email.trim().toLowerCase(),
        role: input.role,
        invited_by: input.invitedBy,
      },
      { onConflict: 'org_id,email' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('organization_invites').delete().eq('id', id)
  if (error) throw error
}

export async function updateMemberRole(
  orgId: string,
  profileId: string,
  role: OrgRole,
): Promise<void> {
  const { error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
  if (error) throw error
}

export async function removeMember(orgId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
  if (error) throw error
}
