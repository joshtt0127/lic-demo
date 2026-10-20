import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Expand, LayoutGrid, Minimize2, MoveHorizontal, RotateCcw } from 'lucide-react'
import { Button, FormError } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PosterImage } from '@/components/PosterImage'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useStudioMutations } from '@/features/studio/queries'
import { can } from '@/lib/access'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { WallCandidate } from '@/data/repositories/wall'
import { AuditionPreview, type PreviewTarget } from './AuditionPreview'
import { ExportDialog, type ExportSource } from './ExportDialog'
import {
  castingProgress,
  categoryLabel,
  categoryTabs,
  inCategory,
  isCustomOrder,
  moveAmongVisible,
  moveTo,
  orderRoles,
  type WallCategory,
  type WallRole,
} from './order'
import { useWallMutations, useWallProject, useWallRoles, wallKeys } from './queries'
import { auditionStats, RoleCard } from './RoleCard'
import { SelectionMenu } from './SelectionMenu'
import { useTapeStills } from './stills'
import { useQueryClient } from '@tanstack/react-query'

/**
 * The Wall™ — le mur de casting d'un projet.
 *
 * Une carte par rôle, dans l'ordre d'importance que la production a écrit, un
 * comédien retenu par carte, et tout le projet sous les yeux. Le mur se lit
 * comme celui d'un bureau de casting : des visages tirés des auditions, des
 * noms de personnages, et des places qui attendent encore quelqu'un.
 *
 * Hiérarchie : l'identité du projet, les catégories de rôles, les cartes, les
 * comédiens, puis — en retrait — les chiffres des auditions et les actions
 * secondaires (arranger, présenter, exporter).
 */

export function WallPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const project = useWallProject(projectId)
  const roles = useWallRoles(projectId)
  const { select, arrange } = useWallMutations(projectId)
  const studio = useStudioMutations(organization?.id, profile?.id)

  const canEdit = can(organization?.role, 'wall:select')
  const canDecide = can(organization?.role, 'candidate:decide')
  const canExport = can(organization?.role, 'wall:export')

  const [params, setParams] = useSearchParams()
  const [menu, setMenu] = useState<{ roleId: string; anchor: HTMLElement } | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [exporting, setExporting] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const all = useMemo(() => roles.data ?? [], [roles.data])
  const tabs = useMemo(() => categoryTabs(all), [all])
  const requested = (params.get('view') ?? 'all') as WallCategory
  const category: WallCategory = tabs.some((tab) => tab.key === requested) ? requested : 'all'
  const arranging = draft !== null

  const ordered = useMemo(
    () => orderRoles(all, draft ?? project.data?.wall_order),
    [all, draft, project.data?.wall_order],
  )
  const visible = useMemo(() => ordered.filter((role) => inCategory(role, category)), [ordered, category])
  const progress = castingProgress(all)
  const stills = useTapeStills(
    ordered.map((role) => role.self_tape_id),
    { orgId: project.data?.org_id, profileId: profile?.id },
  )

  const setCategory = useCallback(
    (next: WallCategory) => {
      const nextParams = new URLSearchParams(params)
      if (next === 'all') nextParams.delete('view')
      else nextParams.set('view', next)
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  // ── Mode présentation : plein écran, rien d'autre que le mur ──
  useEffect(() => {
    if (!presenting) return
    const onKey = (event: KeyboardEvent) => {
      if (preview || menu) return
      if (event.key === 'Escape') setPresenting(false)
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const index = tabs.findIndex((tab) => tab.key === category)
        const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
        if (next) setCategory(next.key)
      }
    }
    const onFullscreen = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreen)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.body.style.overflow = overflow
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [presenting, preview, menu, tabs, category, setCategory])

  function startPresentation() {
    setMenu(null)
    setPresenting(true)
    // Le plein écran est un plus : refusé (iframe, Safari iOS), le mode reste utilisable.
    requestAnimationFrame(() => {
      void stageRef.current?.requestFullscreen?.().catch(() => {})
    })
  }

  // ── Sélection ──
  const roleById = useMemo(() => new Map(all.map((role) => [role.role_id, role])), [all])

  async function place(role: WallRole, candidate: Pick<WallCandidate, 'application_id' | 'name' | 'self_tape_id'>) {
    setError(null)
    try {
      await select.mutateAsync({
        roleId: role.role_id,
        applicationId: candidate.application_id,
        actorName: candidate.name,
        selfTapeId: candidate.self_tape_id,
      })
      setMenu(null)
      toast(`${candidate.name} placed on the Wall as ${role.name}`)
    } catch (placeError) {
      setError(errorMessage(placeError, 'This actor could not be placed on the Wall'))
    }
  }

  async function clear(role: WallRole) {
    setError(null)
    try {
      await select.mutateAsync({ roleId: role.role_id, applicationId: null })
      setMenu(null)
      toast(`${role.name} is open again — ${role.actor_name}'s audition is untouched`)
    } catch (clearError) {
      setError(errorMessage(clearError, 'The selection could not be cleared'))
    }
  }

  async function confirmCasting(role: WallRole) {
    if (!role.application_id) return
    const ok = window.confirm(
      `Confirm ${role.actor_name} as ${role.name}?\n\nThis sets the audition to Cast — a final casting decision, visible to the actor. Wall selections alone never do this.`,
    )
    if (!ok) return
    setError(null)
    try {
      await studio.setApplicationStatus.mutateAsync({ applicationId: role.application_id, status: 'cast' })
      await queryClient.invalidateQueries({ queryKey: wallKeys.roles(projectId) })
      setMenu(null)
      toast(`${role.actor_name} confirmed as ${role.name}`)
    } catch (confirmError) {
      setError(errorMessage(confirmError, 'The casting could not be confirmed'))
    }
  }

  function chooseActor(role: WallRole) {
    if (role.auditions === 0) {
      navigate(`/studio/casting/${role.casting_call_id}`)
      return
    }
    navigate(`/studio/casting/${role.casting_call_id}/review?role=${role.role_id}&wall=${projectId}`, {
      state: { fromWall: true },
    })
  }

  // ── Arrangement ──
  const currentOrder = ordered.map((role) => role.role_id)

  function startArranging() {
    setMenu(null)
    setDraft(currentOrder)
  }

  async function saveArrangement() {
    if (!draft) return
    try {
      const importance = orderRoles(all, null).map((role) => role.role_id)
      const same = importance.every((id, index) => draft[index] === id)
      await arrange.mutateAsync(same ? null : draft)
      setDraft(null)
      toast(same ? 'Back to role importance' : 'Order saved for the whole team')
    } catch (saveError) {
      setError(errorMessage(saveError, 'The order could not be saved'))
    }
  }

  function moveCard(roleId: string, delta: -1 | 1) {
    setDraft((order) =>
      order ? moveAmongVisible(order, visible.map((role) => role.role_id), roleId, delta) : order,
    )
  }

  function onDragOver(event: DragEvent<HTMLElement>, role: WallRole) {
    if (!dragging || dragging === role.role_id) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    setDropTarget((current) => (current?.id === role.role_id && current.side === side ? current : { id: role.role_id, side }))
  }

  function onDrop(event: DragEvent<HTMLElement>, role: WallRole) {
    event.preventDefault()
    if (!dragging || !draft || !dropTarget) return
    const without = draft.filter((id) => id !== dragging)
    const anchorIndex = without.indexOf(role.role_id)
    const index = dropTarget.side === 'before' ? anchorIndex : anchorIndex + 1
    setDraft(moveTo([...without.slice(0, index), dragging, ...without.slice(index)], dragging, index))
    setDragging(null)
    setDropTarget(null)
  }

  // ── Export ──
  const exportSource = useMemo<ExportSource | null>(() => {
    if (!project.data) return null
    const p = project.data
    const toCard = (role: WallRole) => {
      const state = role.self_tape_id ? stills[role.self_tape_id] : undefined
      return {
        roleName: role.name,
        actorName: role.application_id ? role.actor_name : null,
        stillUrl: state?.status === 'ready' ? state.still.url : null,
        stats: auditionStats(role),
        confirmed: role.application_status === 'cast',
      }
    }
    const label = (list: WallRole[]) => {
      const { selected, total } = castingProgress(list)
      return `${selected} of ${total} role${total === 1 ? '' : 's'} selected`
    }
    return {
      document: {
        title: p.title,
        subtitle: [p.production_type, p.genre].filter(Boolean).join(' · ') || p.subtitle,
        posterUrl: p.poster_url,
        logoUrl: p.organization?.logo_url ?? null,
        organizationName: p.company_name || p.organization?.name || null,
        credits: [
          p.director_name ? `Directed by ${p.director_name}` : null,
          p.casting_director_name ? `Casting by ${p.casting_director_name}` : null,
        ].filter((value): value is string => Boolean(value)),
        exportedAt: new Date(),
      },
      all: { cards: ordered.map(toCard), progressLabel: label(ordered) },
      current:
        category === 'all'
          ? null
          : { cards: visible.map(toCard), progressLabel: label(visible), label: categoryLabel(category) },
    }
  }, [project.data, ordered, visible, category, stills])

  // ── États ──
  if (project.isLoading || roles.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-end gap-4">
          <Skeleton className="h-[102px] w-[68px] rounded-[14px]" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-72" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5.9] rounded-card" />
          ))}
        </div>
      </div>
    )
  }

  if (!project.data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{errorMessage(project.error, 'This project is not available')}</FormError>
        <Link to="/studio/projects" className="text-sm font-semibold text-link hover:underline">
          Back to projects
        </Link>
      </div>
    )
  }

  const p = project.data
  const menuRole = menu ? roleById.get(menu.roleId) : undefined
  const meta = [p.production_type, p.genre, p.director_name ? `Directed by ${p.director_name}` : null].filter(Boolean)
  const customOrder = isCustomOrder(all, draft ?? p.wall_order)

  const grid = (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        presenting
          ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] lg:gap-5'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5',
      )}
    >
      {visible.map((role, index) => (
        <RoleCard
          key={role.role_id}
          role={role}
          position={ordered.indexOf(role) + 1}
          still={role.self_tape_id ? stills[role.self_tape_id] : undefined}
          showStats={!presenting}
          canEdit={canEdit}
          arranging={arranging}
          presentation={presenting}
          isFirst={index === 0}
          isLast={index === visible.length - 1}
          dropHint={dropTarget?.id === role.role_id ? dropTarget.side : null}
          onChoose={() => chooseActor(role)}
          onOpenAudition={() =>
            role.application_id &&
            setPreview({
              applicationId: role.application_id,
              selfTapeId: role.self_tape_id,
              name: role.actor_name ?? '',
              roleId: role.role_id,
              roleName: role.name,
            })
          }
          onOpenMenu={(anchor) => setMenu((current) => (current?.roleId === role.role_id ? null : { roleId: role.role_id, anchor }))}
          onMove={(delta) => moveCard(role.role_id, delta)}
          onDragStart={(event) => {
            if (!arranging) return
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', role.role_id)
            setDragging(role.role_id)
          }}
          onDragOver={(event) => arranging && onDragOver(event, role)}
          onDrop={(event) => arranging && onDrop(event, role)}
          onDragEnd={() => {
            setDragging(null)
            setDropTarget(null)
          }}
        />
      ))}
    </div>
  )

  const categoryNav = tabs.length > 1 && (
    <nav aria-label="Role categories" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className={cn('inline-flex gap-1 rounded-btn p-1', presenting ? 'bg-white/10' : 'bg-[#EEECE6]')}>
        {tabs.map((tab) => {
          const active = tab.key === category
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(tab.key)}
              className={cn(
                'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-inner px-3.5 text-[13.5px] font-semibold transition-colors',
                presenting
                  ? active
                    ? 'bg-white text-ink'
                    : 'text-white/70 hover:text-white'
                  : active
                    ? 'bg-card text-ink shadow-sm'
                    : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
              <span className={cn('font-mono text-[11px]', active ? 'text-muted' : presenting ? 'text-white/45' : 'text-muted/70')}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-end gap-4">
          {p.poster_url && (
            <PosterImage
              src={p.poster_url}
              alt={`${p.title} poster`}
              className="hidden h-[102px] w-[68px] shrink-0 rounded-[14px] object-cover shadow-card sm:block"
            />
          )}
          <div className="min-w-0">
            <Link
              to="/studio/projects"
              className="-ml-1 inline-flex h-7 items-center gap-1.5 rounded-btn px-1 text-[12.5px] font-semibold text-muted hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Projects
            </Link>
            <p className="tech-label mt-0.5">The Wall™</p>
            <h1 className="truncate font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.025em] text-ink sm:text-[2.1rem]">
              {p.title}
            </h1>
            {meta.length > 0 && <p className="mt-0.5 truncate text-[13.5px] text-muted">{meta.join(' · ')}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {all.length > 0 && <Progress selected={progress.selected} total={progress.total} confirmed={progress.confirmed} />}
          <div className="flex items-center gap-2">
            {canEdit && all.length > 1 && !arranging && (
              <Button variant="ghost" size="sm" icon={<MoveHorizontal className="h-4 w-4" />} onClick={startArranging}>
                Arrange
              </Button>
            )}
            {all.length > 0 && (
              <Button variant="secondary" size="sm" icon={<Expand className="h-4 w-4" />} onClick={startPresentation}>
                Present
              </Button>
            )}
            {canExport && all.length > 0 && (
              <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => setExporting(true)}>
                Export
              </Button>
            )}
          </div>
        </div>
      </header>

      {categoryNav}

      {arranging && (
        <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-[20px] border border-line bg-card/95 px-4 py-3 shadow-panel backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-ink">
            <span className="font-semibold">Arrange the Wall.</span>{' '}
            <span className="text-muted">Drag the cards, or use the arrows. The order is saved for the whole team.</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              disabled={!customOrder}
              onClick={() => setDraft(orderRoles(all, null).map((role) => role.role_id))}
            >
              Reset to role importance
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveArrangement} disabled={arrange.isPending}>
              Save order
            </Button>
          </div>
        </div>
      )}

      {error && <FormError>{error}</FormError>}

      {all.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title="No roles on this project yet"
          description="The Wall shows one card per role. Add roles to a casting call of this project and they appear here, in order of importance."
          action={
            <Link to="/studio/casting-calls" className="text-sm font-semibold text-link hover:underline">
              Go to casting calls
            </Link>
          }
        />
      ) : (
        grid
      )}

      {!arranging && canEdit && customOrder && (
        <p className="text-[12.5px] text-muted">
          Arranged by your team.{' '}
          <button
            type="button"
            className="font-semibold text-ink underline-offset-2 hover:underline"
            onClick={async () => {
              try {
                await arrange.mutateAsync(null)
                toast('Back to role importance')
              } catch (resetError) {
                setError(errorMessage(resetError, 'The order could not be reset'))
              }
            }}
          >
            Reset to role importance
          </button>
        </p>
      )}

      {/* Présentation : le mur seul, en plein écran. */}
      {presenting && (
        <div ref={stageRef} className="fixed inset-0 z-[100] overflow-y-auto bg-ink text-white">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-5 py-6 sm:px-10 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 items-end gap-4">
                {p.poster_url && (
                  <PosterImage src={p.poster_url} alt="" className="hidden h-[96px] w-[64px] shrink-0 rounded-[12px] object-cover sm:block" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-label text-white/55">
                    The Wall™ · {categoryLabel(category)}
                  </p>
                  <h1 className="truncate font-display text-[clamp(1.8rem,3.4vw,3.2rem)] font-extrabold leading-tight tracking-[-0.03em]">
                    {p.title}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[13px] font-semibold text-white/70">
                  {progress.selected} of {progress.total} roles selected
                </span>
                <button
                  type="button"
                  onClick={() => setPresenting(false)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 text-[13px] font-semibold text-white hover:bg-white/20"
                >
                  <Minimize2 className="h-4 w-4" /> Exit <kbd className="font-mono text-[10px] opacity-60">Esc</kbd>
                </button>
              </div>
            </div>
            {categoryNav}
            {grid}
          </div>
        </div>
      )}

      {menu && menuRole && (
        <SelectionMenu
          role={menuRole}
          anchor={menu.anchor}
          orgId={p.org_id}
          profileId={profile?.id}
          canEdit={canEdit}
          canDecide={canDecide}
          busy={select.isPending || studio.setApplicationStatus.isPending}
          onClose={() => setMenu(null)}
          onWatch={(target) => setPreview({ ...target, roleId: menuRole.role_id, roleName: menuRole.name })}
          onPlace={(candidate) => place(menuRole, candidate)}
          onClear={() => clear(menuRole)}
          onConfirm={() => confirmCasting(menuRole)}
          onOpenQueue={() =>
            navigate(`/studio/casting/${menuRole.casting_call_id}/review?role=${menuRole.role_id}&wall=${projectId}`, {
              state: { fromWall: true },
            })
          }
        />
      )}

      {preview && (
        <AuditionPreview
          target={preview}
          isOnWall={roleById.get(preview.roleId)?.application_id === preview.applicationId}
          canPlace={canEdit}
          busy={select.isPending}
          onClose={() => setPreview(null)}
          onPlace={async () => {
            const role = roleById.get(preview.roleId)
            if (!role) return
            await place(role, {
              application_id: preview.applicationId,
              name: preview.name,
              self_tape_id: preview.selfTapeId ?? '',
            })
            setPreview(null)
          }}
        />
      )}

      {exporting && exportSource && <ExportDialog source={exportSource} onClose={() => setExporting(false)} />}
    </div>
  )
}

/** « 5 of 8 roles selected » — une sélection n'est pas un casting confirmé. */
function Progress({ selected, total, confirmed }: { selected: number; total: number; confirmed: number }) {
  const ratio = total === 0 ? 0 : selected / total
  return (
    <div className="flex min-w-[180px] flex-col gap-1.5" aria-label={`${selected} of ${total} roles selected`}>
      <p className="text-[13px] text-muted">
        <span className="font-semibold text-ink">
          {selected} of {total}
        </span>{' '}
        roles selected
        {confirmed > 0 && <span> · {confirmed} confirmed</span>}
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={selected}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}
