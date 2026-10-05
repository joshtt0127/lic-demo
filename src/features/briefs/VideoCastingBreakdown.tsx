import { useState } from 'react'
import { ChevronDown, Video } from 'lucide-react'
import { Card } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { BriefStudio } from '@/features/briefs/BriefStudio'
import { useBriefMutations, useProjectBriefs } from '@/features/briefs/queries'
import type { Accepted } from '@/features/briefs/mapping'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { BriefVideoRow, BriefVisibility, RoleRow } from '@/types/database'

/**
 * Le Video Casting Breakdown™ d'un casting, sur son tableau de bord : la
 * hiérarchie PROJET → RÔLES se lit d'un coup d'œil, et c'est ici que la
 * source reste vivante (remplacer un brief, changer qui le voit).
 */
export function VideoCastingBreakdown({
  projectId,
  orgId,
  profileId,
  roles,
  editable,
  onApplyProject,
  onApplyRole,
  bare,
}: {
  projectId: string
  orgId: string | undefined
  profileId: string | undefined
  roles: RoleRow[]
  editable: boolean
  onApplyProject: (accepted: Accepted) => void
  onApplyRole: (role: RoleRow, accepted: Accepted) => void
  /** Dans l'éditeur du casting : sans carte ni titre, la section les porte déjà. */
  bare?: boolean
}) {
  const toast = useToast()
  const briefs = useProjectBriefs(projectId)
  const mutations = useBriefMutations()
  const [openRole, setOpenRole] = useState<string | null>(null)

  const projectBrief = (briefs.data ?? []).find((brief) => brief.role_id === null) ?? null
  const roleBrief = (roleId: string) =>
    (briefs.data ?? []).find((brief) => brief.role_id === roleId) ?? null

  async function save(
    roleId: string | null,
    existing: BriefVideoRow | null,
    input: { url: string; mediaAssetId: string; durationS: number | null },
  ) {
    try {
      await mutations.save.mutateAsync({
        projectId,
        roleId,
        url: input.url,
        mediaAssetId: input.mediaAssetId,
        durationS: input.durationS,
        visibility: existing?.visibility ?? 'applicants',
      })
      toast(existing ? 'Brief replaced' : 'Brief saved')
    } catch (error) {
      toast(errorMessage(error, 'Could not save the brief'))
      throw error
    }
  }

  const setVisibility = (brief: BriefVideoRow | null, visibility: BriefVisibility) =>
    brief && mutations.visibility.mutate({ id: brief.id, visibility })

  const Shell = bare ? 'div' : Card
  if (briefs.isLoading) return bare ? <p className="text-[13px] text-muted">Loading the briefs…</p> : <Card className="h-40" />

  // Un membre sans droit d'édition voit les vidéos, sans les outils.
  if (!editable) {
    if (!projectBrief && roles.every((role) => !roleBrief(role.id))) return null
    return (
      <Card className="flex flex-col gap-4">
        <Header />
        {projectBrief && (
          <video src={projectBrief.url} controls playsInline className="aspect-video w-full rounded-field bg-ink" />
        )}
      </Card>
    )
  }

  return (
    <Shell className="flex flex-col gap-5">
      {!bare && <Header />}

      <BriefStudio
        target="project"
        orgId={orgId}
        profileId={profileId}
        video={projectBrief ? { url: projectBrief.url, visibility: projectBrief.visibility } : null}
        onVideo={(input) => save(null, projectBrief, input)}
        onVisibility={(visibility) => setVisibility(projectBrief, visibility)}
        onRemove={projectBrief ? () => mutations.remove.mutate(projectBrief.id) : undefined}
        onApply={onApplyProject}
      />

      {roles.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="tech-label">Role Brief Videos™</span>
          <ul className="flex flex-col gap-2">
            {roles.map((role) => {
              const brief = roleBrief(role.id)
              const open = openRole === role.id
              return (
                <li key={role.id} className="rounded-field border border-line">
                  <button
                    type="button"
                    onClick={() => setOpenRole(open ? null : role.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        brief ? 'bg-ink text-white' : 'bg-line text-muted',
                      )}
                    >
                      <Video className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-ink">{role.name}</span>
                      <span className="block text-[12.5px] text-muted">
                        {brief ? 'Brief recorded' : 'No brief yet'}
                      </span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="border-t border-line p-3">
                      <BriefStudio
                        target="role"
                        compact
                        title={`Role Brief Video™ — ${role.name}`}
                        orgId={orgId}
                        profileId={profileId}
                        video={brief ? { url: brief.url, visibility: brief.visibility } : null}
                        onVideo={(input) => save(role.id, brief, input)}
                        onVisibility={(visibility) => setVisibility(brief, visibility)}
                        onRemove={brief ? () => mutations.remove.mutate(brief.id) : undefined}
                        onApply={(accepted) => onApplyRole(role, accepted)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Shell>
  )
}

function Header() {
  return (
    <div>
      <h2 className="font-display text-[19px] font-bold text-ink">Video Casting Breakdown™</h2>
      <p className="mt-1 text-[14px] text-muted">
        Brief once. Launch everywhere — the project brief sets the context, each role brief gives its
        direction. Talents see them on the casting before they record.
      </p>
    </div>
  )
}
