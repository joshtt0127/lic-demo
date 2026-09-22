import { supabase } from '@/lib/supabase'

/**
 * The social graph: who follows whom.
 *
 * Two links, because the marketplace has two kinds of actors — a person follows
 * a person, and a person follows a production company. Counts are read from a
 * view (`v_profile_network`) rather than stored: a denormalised counter always
 * ends up lying after a cascade delete.
 */

export type NetworkCounts = {
  followers: number
  following: number
  organizationsFollowed: number
}

export async function networkCounts(profileId: string): Promise<NetworkCounts> {
  const { data, error } = await supabase
    .from('v_profile_network')
    .select('followers, following, organizations_followed')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return {
    followers: data?.followers ?? 0,
    following: data?.following ?? 0,
    organizationsFollowed: data?.organizations_followed ?? 0,
  }
}

/** The organizations this account follows. */
export async function followedOrganizations(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization_follows')
    .select('org_id')
    .eq('profile_id', profileId)
  if (error) throw error
  return (data ?? []).map((row) => row.org_id)
}

export async function followOrganization(profileId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_follows')
    .insert({ profile_id: profileId, org_id: orgId })
  if (error) throw error
}

export async function unfollowOrganization(profileId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_follows')
    .delete()
    .eq('profile_id', profileId)
    .eq('org_id', orgId)
  if (error) throw error
}

/** The profiles this account follows. */
export async function followedProfiles(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', profileId)
  if (error) throw error
  return (data ?? []).map((row) => row.following_id)
}

export async function followProfile(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId })
  if (error) throw error
}

export async function unfollowProfile(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  if (error) throw error
}

/** How many people follow each of these organizations. */
export async function organizationFollowerCounts(
  orgIds: string[],
): Promise<Map<string, number>> {
  if (orgIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('organization_follows')
    .select('org_id')
    .in('org_id', orgIds)
  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data ?? []) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1)
  return counts
}
