import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, ArrowLeft, Download, Play, Search, X } from 'lucide-react'
import { Button, FormError } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useCandidatesForRoles, useOrgCasting } from '@/features/studio/queries'
import { useIntelligenceFeed } from '@/features/intelligence/queries'
import { BAND_DESCRIPTION, BAND_LABEL, explainReason } from '@/features/intelligence/reasons'
import { ReviewCard } from '@/features/review/ReviewCard'
import { WatchMode } from '@/features/review/WatchMode'
import { useBatchStatus, useMySeen, useMyVotes, useQueueTapes } from '@/features/review/queries'
import { useApplicationLabels, useLabelMutations, useOrgLabels } from '@/features/review/labels'
import {
  DEFAULT_DIR,
  buildQueue,
  matchesProgress,
  progress,
  reviewState,
  sortQueue,
  toCsv,
  type ProgressFilter,
  type QueueItem,
  type SortDir,
  type SortMode,
} from '@/features/review/sort'
import { CandidateReviewModal } from '@/studio/CandidateReviewModal'
import { can } from '@/lib/access'
import { APPLICATION_STATUS_LABEL } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { ApplicationStatus, AttentionBand, ReviewLabelRow, ReviewLabelTone } from '@/types/database'

const PAGE = 48
const MOVE_TO: ApplicationStatus[] = ['under_review', 'shortlisted', 'offer', 'cast', 'not_selected']
const BANDS = Object.fromEntries(
  (['priority', 'discovery', 'all'] as AttentionBand[]).map((band) => [band, { title: BAND_LABEL[band], description: BAND_DESCRIPTION[band] }]),
) as Record<AttentionBand, { title: string; description: string }>

/**
 * Audition Review Queue™ — See who matters first.
 *
 * Toutes les auditions d'un casting (ou d'un rôle), en cartes jouables. Par
 * défaut l'Intelligence Feed™ ordonne l'attention ; la date, le nom et le rôle
 * sont à un clic, sans jamais rien masquer. On regarde, on juge, on décide —
 * seul ou en lot — et chaque geste nourrit la mémoire de l'équipe.
 */
export function ReviewQueuePage() {
  const { castingId } = useParams()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const mayReview = can(organization?.role, 'candidate:review')
  const mayDecide = can(organization?.role, 'candidate:decide')

  const casting = useOrgCasting(castingId)
  const roles = casting.data?.roles ?? []
  const roleIds = roles.map((role) => role.id)
  const candidates = useCandidatesForRoles(roleIds)
  const feed = useIntelligenceFeed(castingId)
  const batch = useBatchStatus()

  // L'état de la file vit dans l'URL : un lien partagé ouvre la même vue.
  const roleId = params.get('role') ?? 'all'
  const singleRole = roleId !== 'all'
  const rawSort = (params.get('sort') as SortMode) ?? 'intelligence'
  const sort: SortMode = singleRole && rawSort === 'role' ? 'intelligence' : rawSort
  const dir = ((params.get('dir') as SortDir) ?? DEFAULT_DIR[sort]) as SortDir
  const show = (params.get('show') as ProgressFilter) ?? 'all'
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    if (key === 'sort') next.delete('dir')
    setParams(next, { replace: true })
  }

  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [watching, setWatching] = useState<number | null>(null)
  const [reviewing, setReviewing] = useState<QueueItem | null>(null)
  const [localSeen, setLocalSeen] = useState<Set<string>>(new Set())
  const [confirmPass, setConfirmPass] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all = useMemo(() => buildQueue(candidates.data ?? [], feed.data), [candidates.data, feed.data])
  const inRole = useMemo(() => (singleRole ? all.filter((item) => item.role_id === roleId) : all), [all, roleId, singleRole])
  const ids = useMemo(() => inRole.map((item) => item.application_id), [inRole])
  const seenQuery = useMySeen(profile?.id, ids)
  const votes = useMyVotes(profile?.id, ids)
  const seen = useMemo(() => new Set([...(seenQuery.data ?? []), ...localSeen]), [seenQuery.data, localSeen])
  const orgLabels = useOrgLabels(organization?.id)
  const applied = useApplicationLabels(ids)
  const labelMutations = useLabelMutations(organization?.id, profile?.id)
  const labelId = params.get('label')
  const labelsById = useMemo(() => new Map((orgLabels.data ?? []).map((label) => [label.id, label])), [orgLabels.data])
  const labelled = useMemo(
    () => new Set(Object.entries(applied.data ?? {}).filter(([, list]) => list.length > 0).map(([id]) => id)),
    [applied.data],
  )
  const labelsOf = (applicationId: string): ReviewLabelRow[] =>
    (applied.data?.[applicationId] ?? []).map((id) => labelsById.get(id)).filter((label): label is ReviewLabelRow => Boolean(label))

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return inRole.filter(
      (item) =>
        matchesProgress(item, show, seen, labelled) &&
        (!needle || item.name.toLowerCase().includes(needle)) &&
        (!labelId || (applied.data?.[item.application_id] ?? []).includes(labelId)),
    )
  }, [inRole, show, seen, labelled, query, labelId, applied.data])
  const sections = useMemo(() => sortQueue(filtered, sort, dir, BANDS), [filtered, sort, dir])
  const ordered = useMemo(() => sections.flatMap((section) => section.items), [sections])

  // Les cartes affichées (pagination) : seules leurs tapes sont signées.
  const visibleIds = useMemo(() => new Set(ordered.slice(0, limit).map((item) => item.application_id)), [ordered, limit])
  const tapes = useQueueTapes([...visibleIds])
  const stats = progress(inRole, seen, labelled)

  const loading = casting.isLoading || (roleIds.length > 0 && candidates.isLoading)
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (!casting.data) {
    return <FormError>{errorMessage(casting.error, 'This casting is not available.')}</FormError>
  }

  const counts = { all: stats.total, unseen: stats.unseen, seen: stats.seen, waiting: stats.waiting, decided: stats.decided }
  const selectedItems = ordered.filter((item) => selected.has(item.application_id))
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const firstUnseen = ordered.findIndex((item) => reviewState(item, seen, labelled) === 'unseen')

  function exportCsv(items: QueueItem[]) {
    const csv = toCsv(
      items,
      (item) => (item.feed?.reasons ?? []).map(explainReason).join(' | '),
      (item) => labelsOf(item.application_id).map((label) => label.name).join(' | '),
    )
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${casting.data?.title ?? 'auditions'} — review queue.csv`.replace(/[/\\?%*:|"<>]/g, '-')
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function setLabel(applicationIds: string[], label: ReviewLabelRow, on: boolean) {
    setError(null)
    try {
      await labelMutations.set.mutateAsync({ applicationIds, labelId: label.id, on })
    } catch (labelError) {
      setError(errorMessage(labelError, 'Could not update the label'))
    }
  }

  async function createAndSet(applicationIds: string[], name: string, tone: ReviewLabelTone) {
    setError(null)
    try {
      const label = await labelMutations.create.mutateAsync({ name, tone })
      await labelMutations.set.mutateAsync({ applicationIds, labelId: label.id, on: true })
      return label
    } catch (labelError) {
      setError(errorMessage(labelError, 'Could not create the label'))
      return null
    }
  }

  async function applyBatch(status: ApplicationStatus) {
    setError(null)
    setConfirmPass(false)
    const result = await batch.mutateAsync({ ids: selectedItems.map((item) => item.application_id), status })
    if (result.failed.length) {
      setError(`${result.failed.length} audition${result.failed.length > 1 ? 's' : ''} could not be updated.`)
      setSelected(new Set(result.failed))
    } else {
      toast(`${result.done} audition${result.done > 1 ? 's' : ''} → ${APPLICATION_STATUS_LABEL[status]}`)
      setSelected(new Set())
    }
  }

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'intelligence', label: 'Intelligence Feed™' },
    { value: 'date', label: 'Submission date' },
    { value: 'name', label: 'Actor name' },
    // Trier par rôle n'a de sens que sur plusieurs rôles.
    ...(!singleRole && roles.length > 1 ? [{ value: 'role' as SortMode, label: 'Role' }] : []),
  ]
  const dirLabel =
    sort === 'date' ? (dir === 'desc' ? 'Newest first' : 'Oldest first') : dir === 'asc' ? 'A → Z' : 'Z → A'

  return (
    <div className="flex flex-col gap-5 pb-28">
      <div>
        <Link
          to={`/studio/casting/${castingId}`}
          className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-btn px-2 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          {casting.data.project?.title ?? casting.data.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[1.9rem] font-extrabold tracking-[-0.025em] text-ink sm:text-[2.3rem]">
              Audition Review Queue™
            </h1>
            <p className="mt-1 text-[15px] text-muted">
              See who matters first. Every audition stays one click away — the feed orders attention, your team decides.
            </p>
          </div>
          {firstUnseen >= 0 && (
            <Button variant="premium" icon={<Play className="h-4 w-4 fill-current" />} onClick={() => setWatching(firstUnseen)}>
              Watch from the first unseen
            </Button>
          )}
        </div>
      </div>

      {/* Rôles */}
      {roles.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', name: 'All roles' }, ...roles].map((role) => {
            const count = role.id === 'all' ? all.length : all.filter((item) => item.role_id === role.id).length
            const active = roleId === role.id
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setParam('role', role.id === 'all' ? null : role.id)
                  setSelected(new Set())
                }}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink hover:border-ink/30',
                )}
              >
                {role.name} <span className={active ? 'text-white/60' : 'text-muted'}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Barre de tri et progression */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label font-semibold uppercase tracking-label text-muted">Sort</span>
          <div role="radiogroup" aria-label="Sort auditions" className="flex flex-wrap gap-1 rounded-btn bg-paper p-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={sort === option.value}
                onClick={() => setParam('sort', option.value === 'intelligence' ? null : option.value)}
                className={cn(
                  'rounded-inner px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  sort === option.value ? 'bg-ink text-white' : 'text-ink/75 hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {sort !== 'intelligence' && (
            <button
              type="button"
              onClick={() => setParam('dir', dir === 'asc' ? 'desc' : 'asc')}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink/30"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {dirLabel}
            </button>
          )}
          <label className="relative ml-auto w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find an actor"
              aria-label="Find an actor"
              className="h-9 w-full rounded-btn border border-line bg-paper pl-9 pr-3 text-[13.5px] outline-none focus:border-ink/30"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label font-semibold uppercase tracking-label text-muted">Show</span>
          {(['all', 'unseen', 'seen', 'waiting', 'decided'] as ProgressFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setParam('show', key === 'all' ? null : key)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12.5px] font-semibold capitalize transition-colors',
                show === key ? 'border-ink bg-ink text-white' : 'border-line text-ink hover:border-ink/30',
              )}
            >
              {key} <span className={show === key ? 'text-white/60' : 'text-muted'}>{counts[key]}</span>
            </button>
          ))}
          {(orgLabels.data ?? []).length > 0 && (
            <select
              aria-label="Filter by label"
              value={labelId ?? ''}
              onChange={(event) => setParam('label', event.target.value || null)}
              className={cn(
                'h-8 rounded-full border px-3 text-[12.5px] font-semibold',
                labelId ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink',
              )}
            >
              <option value="">Any label</option>
              {(orgLabels.data ?? []).map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          )}
          {/* Progression personnelle de la revue */}
          {stats.total > 0 && (
            <div className="ml-auto flex min-w-[180px] flex-1 items-center gap-2 sm:max-w-xs" aria-label="Your review progress">
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span className="bg-ink" style={{ width: `${(stats.decided / stats.total) * 100}%` }} />
                <span className="bg-ink/55" style={{ width: `${(stats.waiting / stats.total) * 100}%` }} />
                <span className="bg-ink/25" style={{ width: `${(stats.seen / stats.total) * 100}%` }} />
              </div>
              <span className="whitespace-nowrap text-[12px] text-muted">
                {stats.decided} decided · {stats.waiting} waiting · {stats.seen} seen · {stats.unseen} unseen
              </span>
            </div>
          )}
        </div>
      </div>

      {sort === 'intelligence' && (
        <p className="text-[12.5px] leading-snug text-muted">
          Prioritized is not “best”. The feed orders attention for <em>this</em> casting from signals your team can read on
          every card — and keeps a Discovery lane so first-time applicants are never buried.
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      {inRole.length === 0 ? (
        <EmptyState title="No audition yet" description="Submissions appear here as soon as talents apply." />
      ) : ordered.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try another filter — every audition is still here." />
      ) : (
        (() => {
          let shown = 0
          return sections.map((section) => {
            const remaining = Math.max(0, limit - shown)
            const items = section.items.slice(0, remaining)
            shown += items.length
            if (items.length === 0) return null
            return (
              <section key={section.key} className="flex flex-col gap-3">
                {section.title && (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h2 className="font-display text-[1.25rem] font-extrabold text-ink">{section.title}</h2>
                    <span className="text-[13px] text-muted">
                      {section.items.length} audition{section.items.length > 1 ? 's' : ''}
                      {section.description ? ` · ${section.description}` : ''}
                    </span>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {items.map((item) => (
                    <ReviewCard
                      key={item.application_id}
                      item={item}
                      tape={tapes.data?.[item.application_id]}
                      state={reviewState(item, seen, labelled)}
                      myVote={votes.data?.[item.application_id]}
                      selected={selected.has(item.application_id)}
                      selectable={mayReview}
                      showRole={!singleRole && roles.length > 1}
                      showWhy={sort === 'intelligence'}
                      labels={labelsOf(item.application_id)}
                      onToggle={() => toggle(item.application_id)}
                      onOpen={() => setWatching(ordered.indexOf(item))}
                    />
                  ))}
                </div>
              </section>
            )
          })
        })()
      )}

      {ordered.length > limit && (
        <Button variant="secondary" className="self-center" onClick={() => setLimit((value) => value + PAGE)}>
          Show {Math.min(PAGE, ordered.length - limit)} more · {ordered.length - limit} left
        </Button>
      )}

      {/* Lot : sélection multiple, décision, export */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-card bg-ink px-4 py-3 text-white shadow-panel sm:inset-x-6">
          <span className="text-[14px] font-bold">{selected.size} selected</span>
          <button type="button" onClick={() => setSelected(new Set(ordered.map((item) => item.application_id)))} className="text-[12.5px] font-semibold text-white/70 underline-offset-2 hover:underline">
            Select all {ordered.length}
          </button>
          <span className="flex-1" />
          {mayDecide && (
            <>
              <Button size="sm" variant="premium" disabled={batch.isPending} onClick={() => void applyBatch('shortlisted')}>
                Shortlist
              </Button>
              {confirmPass ? (
                <Button size="sm" variant="secondary" disabled={batch.isPending} onClick={() => void applyBatch('not_selected')}>
                  Confirm: pass {selected.size}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmPass(true)}>
                  Pass
                </Button>
              )}
              <select
                aria-label="Move selected auditions to a status"
                value=""
                disabled={batch.isPending}
                onChange={(event) => event.target.value && void applyBatch(event.target.value as ApplicationStatus)}
                className="h-9 rounded-btn border border-white/20 bg-transparent px-2.5 text-[13px] font-semibold text-white"
              >
                <option value="" className="text-ink">Move to…</option>
                {MOVE_TO.map((status) => (
                  <option key={status} value={status} className="text-ink">
                    {APPLICATION_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </>
          )}
          {mayReview && (
            <select
              aria-label="Label the selected auditions"
              value=""
              disabled={labelMutations.set.isPending || labelMutations.create.isPending}
              onChange={(event) => {
                const value = event.target.value
                if (!value) return
                const ids = selectedItems.map((item) => item.application_id)
                if (value.startsWith('new:')) {
                  const name = window.prompt('Name of the new label')
                  if (name?.trim()) void createAndSet(ids, name, 'neutral').then((label) => label && toast(`“${label.name}” added to ${ids.length}`))
                  return
                }
                const label = labelsById.get(value)
                if (label) void setLabel(ids, label, true).then(() => toast(`“${label.name}” added to ${ids.length}`))
              }}
              className="h-9 rounded-btn border border-white/20 bg-transparent px-2.5 text-[13px] font-semibold text-white"
            >
              <option value="" className="text-ink">Label…</option>
              {(orgLabels.data ?? []).map((label) => (
                <option key={label.id} value={label.id} className="text-ink">
                  {label.name}
                </option>
              ))}
              <option value="new:" className="text-ink">+ New label…</option>
            </select>
          )}
          <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv(selectedItems)}>
            Export
          </Button>
          <button type="button" onClick={() => { setSelected(new Set()); setConfirmPass(false) }} aria-label="Clear selection" className="flex h-9 w-9 items-center justify-center rounded-btn text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        mayReview && ordered.length > 0 && (
          <button type="button" onClick={() => exportCsv(ordered)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted hover:text-ink">
            <Download className="h-3.5 w-3.5" /> Export this list (CSV)
          </button>
        )
      )}

      {watching !== null && ordered[watching] && (
        <WatchMode
          items={ordered}
          index={watching}
          onIndex={setWatching}
          onClose={() => setWatching(null)}
          onOpenFullReview={(item) => {
            setWatching(null)
            setReviewing(item)
          }}
          onSeen={(id) => setLocalSeen((current) => new Set(current).add(id))}
          labels={orgLabels.data ?? []}
          appliedLabels={new Set(applied.data?.[ordered[watching].application_id] ?? [])}
          labelsBusy={labelMutations.set.isPending || labelMutations.create.isPending}
          onToggleLabel={(applicationId, label, on) => void setLabel([applicationId], label, on)}
          onCreateLabel={(applicationId, name, tone) => void createAndSet([applicationId], name, tone)}
        />
      )}

      {reviewing && (
        <CandidateReviewModal
          candidate={reviewing}
          role={roles.find((role) => role.id === reviewing.role_id) ?? null}
          orgId={organization?.id}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  )
}
