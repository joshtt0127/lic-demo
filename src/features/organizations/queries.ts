import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptInvite,
  createOrganization,
  listMyInvites,
  listMyOrganizations,
  updateOrganization,
  type OrganizationInput,
} from '@/data/repositories/organizations'
import type { OrganizationInviteRow } from '@/types/database'

/** Hooks for the production side's team. */

export const myOrganizationsKey = (profileId: string | undefined) => ['my-organizations', profileId]

export function useMyOrganizations(profileId: string | undefined) {
  return useQuery({
    queryKey: myOrganizationsKey(profileId),
    queryFn: () => listMyOrganizations(profileId as string),
    enabled: Boolean(profileId),
  })
}

/** The organization the studio currently works in (the first one, for now). */
export function useCurrentOrganization(profileId: string | undefined) {
  const query = useMyOrganizations(profileId)
  return { ...query, organization: query.data?.[0] ?? null }
}

export function useMyInvites(enabled = true) {
  return useQuery({ queryKey: ['my-invites'], queryFn: listMyInvites, enabled })
}

export function useOrganizationMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: myOrganizationsKey(profileId) })
    void queryClient.invalidateQueries({ queryKey: ['my-invites'] })
  }

  const create = useMutation({
    mutationFn: (input: OrganizationInput) => createOrganization(profileId as string, input),
    onSuccess: invalidate,
  })

  const join = useMutation({
    mutationFn: (invite: OrganizationInviteRow) => acceptInvite(profileId as string, invite),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateOrganization>[1] }) =>
      updateOrganization(id, patch),
    onSuccess: invalidate,
  })

  return { create, join, update }
}
