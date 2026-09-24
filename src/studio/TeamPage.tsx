import { useState } from 'react'
import { Copy, Mail, Trash2, UserPlus, Users } from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  FormError,
  FormField,
  Input,
  SelectInput,
  Spinner,
  Tag,
} from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  useCurrentOrganization,
  useOrgInvites,
  useOrgMembers,
  useTeamMutations,
} from '@/features/organizations/queries'
import { ASSIGNABLE_ORG_ROLES, ORG_ROLE_LABEL, can } from '@/lib/access'
import { relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { OrgRole } from '@/types/database'

/**
 * The team of the organization: who is in it, what they can do, and the
 * invitations waiting.
 *
 * An invitation is a real row with a token. Nothing here sends email — the
 * browser cannot — so the link is handed back to be shared, which is what the
 * POC can honestly do.
 */

const ROLES: OrgRole[] = ASSIGNABLE_ORG_ROLES

const ROLE_HINT: Record<OrgRole, string> = {
  owner: 'Everything, and the organization itself — one person at a time.',
  admin: 'Everything except handing the organization over.',
  // Converti en `admin` : n'apparaît plus que sur une ligne historique.
  casting_director: 'Everything except handing the organization over.',
  member: 'Review candidates, vote, take notes, message.',
  viewer: 'Read only.',
}

export function TeamPage() {
  const toast = useToast()
  const { profile } = useAuth()
  const { organization, isLoading } = useCurrentOrganization(profile?.id)
  const members = useOrgMembers(organization?.id)
  const invites = useOrgInvites(organization?.id)
  const mutations = useTeamMutations(organization?.id, profile?.id)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('member')
  const [error, setError] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)

  const mayInvite = can(organization?.role, 'org:invite')

  if (isLoading) {
    return <Skeleton className="h-64" />
  }

  if (!organization) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No organization"
        description="Create your organization to invite a team."
      />
    )
  }

  async function invite() {
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    try {
      const created = await mutations.invite.mutateAsync({ email, role })
      const link = `${window.location.origin}${import.meta.env.BASE_URL}auth/sign-up?invite=${created.token}`
      setLastLink(link)
      setEmail('')
      toast('Invitation created — share the link')
    } catch (inviteError) {
      setError(errorMessage(inviteError, 'Could not create the invitation'))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
          Team
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {organization.name} · {members.data?.length ?? 0} member
          {(members.data?.length ?? 0) === 1 ? '' : 's'}
        </p>
      </header>

      {error && <FormError>{error}</FormError>}

      <Card className="flex flex-col gap-4">
        <span className="tech-label">Members</span>

        {members.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {(members.data ?? []).map((member) => {
              const name =
                [member.profile?.first_name, member.profile?.last_name]
                  .filter(Boolean)
                  .join(' ') || 'Member'
              const isMe = member.profile_id === profile?.id

              return (
                <li key={member.profile_id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar src={member.profile?.avatar_url ?? undefined} name={name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">
                      {name}
                      {isMe && <span className="ml-2 text-[12px] font-normal text-muted">you</span>}
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {[member.jobTitle, member.profile?.city].filter(Boolean).join(' · ') ||
                        ORG_ROLE_LABEL[member.role]}
                    </span>
                  </span>

                  {can(organization.role, 'org:manage') && !isMe ? (
                    <SelectInput
                      value={member.role}
                      className="w-[190px]"
                      onChange={(event) =>
                        mutations.setRole.mutate({
                          memberId: member.profile_id,
                          role: event.target.value as OrgRole,
                        })
                      }
                    >
                      {ROLES.map((item) => (
                        <option key={item} value={item}>
                          {ORG_ROLE_LABEL[item]}
                        </option>
                      ))}
                    </SelectInput>
                  ) : (
                    <Tag tone={member.role === 'owner' ? 'gold' : 'neutral'}>
                      {ORG_ROLE_LABEL[member.role]}
                    </Tag>
                  )}

                  {can(organization.role, 'org:manage') && !isMe && (
                    <button
                      onClick={() => mutations.remove.mutate(member.profile_id)}
                      aria-label={`Remove ${name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {mayInvite && (
        <Card className="flex flex-col gap-4">
          <div>
            <span className="tech-label">Invite someone</span>
            <p className="mt-1 text-[13px] text-muted">{ROLE_HINT[role]}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
            <FormField label="Email" htmlFor="invite-email" plainLabel>
              <Input
                id="invite-email"
                fieldSize="lg"
                type="email"
                icon={<Mail className="h-[18px] w-[18px]" />}
                placeholder="teammate@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <FormField label="Role" htmlFor="invite-role" plainLabel>
              <SelectInput
                id="invite-role"
                fieldSize="lg"
                value={role}
                onChange={(event) => setRole(event.target.value as OrgRole)}
              >
                {ROLES.filter((item) => item !== 'owner').map((item) => (
                  <option key={item} value={item}>
                    {ORG_ROLE_LABEL[item]}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <div className="flex items-end">
              <Button
                size="lg"
                onClick={invite}
                disabled={mutations.invite.isPending}
                icon={
                  mutations.invite.isPending ? <Spinner /> : <UserPlus className="h-[18px] w-[18px]" />
                }
              >
                Invite
              </Button>
            </div>
          </div>

          {lastLink && (
            <div className="flex flex-wrap items-center gap-3 rounded-field bg-paper p-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">
                {lastLink}
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => {
                  void navigator.clipboard.writeText(lastLink)
                  toast('Invitation link copied')
                }}
              >
                Copy link
              </Button>
            </div>
          )}

          <p className="text-[12px] text-muted">
            The invitation is a real row with a token; sending the email needs a server, so share
            the link yourself for now. When they sign up with that address, the invitation appears
            in their onboarding.
          </p>
        </Card>
      )}

      {(invites.data?.length ?? 0) > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="tech-label">Pending invitations</span>
          <ul className="flex flex-col divide-y divide-line">
            {(invites.data ?? []).map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {invite.email}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {ORG_ROLE_LABEL[invite.role]} · sent {relativeTime(invite.created_at)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `${window.location.origin}${import.meta.env.BASE_URL}auth/sign-up?invite=${invite.token}`,
                    )
                    toast('Invitation link copied')
                  }}
                >
                  Copy link
                </Button>
                {can(organization.role, 'org:manage') && (
                  <button
                    onClick={() => mutations.revoke.mutate(invite.id)}
                    aria-label={`Revoke the invitation for ${invite.email}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
