import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptInvite,
  acceptInviteByToken,
  createInvite,
  createOrganization,
  listMyInvites,
  listMyOrganizations,
  listOrgInvites,
  listOrgMembers,
  removeMember,
  revokeInvite,
  updateMemberRole,
  updateOrganization,
  type OrganizationInput,
} from '@/data/repositories/organizations'
import type { OrganizationInviteRow, OrgRole } from '@/types/database'

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

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => listOrgMembers(orgId as string),
    enabled: Boolean(orgId),
  })
}

export function useOrgInvites(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-invites', orgId],
    queryFn: () => listOrgInvites(orgId as string),
    enabled: Boolean(orgId),
  })
}

export function useTeamMutations(orgId: string | undefined, profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['org-members', orgId] })
    void queryClient.invalidateQueries({ queryKey: ['org-invites', orgId] })
  }

  const invite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: OrgRole }) =>
      createInvite({ orgId: orgId as string, email, role, invitedBy: profileId as string }),
    onSuccess: invalidate,
  })

  const revoke = useMutation({ mutationFn: revokeInvite, onSuccess: invalidate })

  const setRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRole }) =>
      updateMemberRole(orgId as string, memberId, role),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(orgId as string, memberId),
    onSuccess: invalidate,
  })

  return { invite, revoke, setRole, remove }
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

  /** Le lien reçu par e-mail : un jeton, et rien d'autre à saisir. */
  const joinByToken = useMutation({
    mutationFn: (token: string) => acceptInviteByToken(token),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateOrganization>[1] }) =>
      updateOrganization(id, patch),
    onSuccess: invalidate,
  })

  return { create, join, joinByToken, update }
}
