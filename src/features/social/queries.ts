import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  followedOrganizations,
  followedProfiles,
  followOrganization,
  followProfile,
  networkCounts,
  organizationFollowerCounts,
  unfollowOrganization,
  unfollowProfile,
} from '@/data/repositories/social'

/** Who this account follows, and who follows it. */
export function useNetworkCounts(profileId: string | undefined) {
  return useQuery({
    queryKey: ['network-counts', profileId],
    queryFn: () => networkCounts(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useFollowedOrganizations(profileId: string | undefined) {
  return useQuery({
    queryKey: ['followed-organizations', profileId],
    queryFn: () => followedOrganizations(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useFollowedProfiles(profileId: string | undefined) {
  return useQuery({
    queryKey: ['followed-profiles', profileId],
    queryFn: () => followedProfiles(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useOrganizationFollowers(orgIds: string[]) {
  const key = [...orgIds].sort().join(',')
  return useQuery({
    queryKey: ['organization-followers', key],
    queryFn: () => organizationFollowerCounts(orgIds),
    enabled: orgIds.length > 0,
  })
}

export function useFollowMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['followed-organizations', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['followed-profiles', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['network-counts', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['organization-followers'] })
  }

  const organization = useMutation({
    mutationFn: ({ orgId, following }: { orgId: string; following: boolean }) =>
      following
        ? unfollowOrganization(profileId as string, orgId)
        : followOrganization(profileId as string, orgId),
    onSuccess: invalidate,
  })

  const person = useMutation({
    mutationFn: ({ targetId, following }: { targetId: string; following: boolean }) =>
      following
        ? unfollowProfile(profileId as string, targetId)
        : followProfile(profileId as string, targetId),
    onSuccess: invalidate,
  })

  return { organization, person }
}
