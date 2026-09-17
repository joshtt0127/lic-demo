import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bookmark,
  Download,
  SlidersHorizontal,
  LayoutGrid,
  List,
  MapPin,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  FormError,
  Input,
  SelectInput,
  Spinner,
  Tag,
} from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import {
  matchTalentToRole,
  useCandidatesForRoles,
  useOrgCastings,
  useSavedSearchMutations,
  useSavedSearches,
  useSavedTalents,
  useSaveTalent,
  useTalentSearch,
  type TalentSearchResult,
} from '@/features/studio/queries'
import { useLanguagesCatalog, useSkillsCatalog } from '@/features/talent/queries'
import { relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/**
 * Talent Recruiter — search the platform's real talent profiles.
 *
 * The "match" is not a model: pick one of your roles and each talent is scored
 * against the criteria that role actually states (playing age, gender,
 * languages, skills, location), with the breakdown visible. A role with no
 * criteria scores everyone the same, which is the honest answer.
 */

const TABS = ['search', 'campaigns', 'pipeline', 'saved'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  search: 'Search',
  campaigns: 'My campaigns',
  pipeline: 'Pipeline',
  saved: 'Saved searches',
}

type Filters = {
  query: string
  city: string
  gender: string
  playingAge: string
  language: string
  skill: string
  experience: string
  hasReel: boolean
  savedOnly: boolean
}

const EMPTY_FILTERS: Filters = {
  query: '',
  city: '',
  gender: '',
  playingAge: '',
  language: '',
  skill: '',
  experience: '',
  hasReel: false,
  savedOnly: false,
}

export function TalentRecruiterPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const profileId = profile?.id
  const { organization } = useCurrentOrganization(profileId)

  const [tab, setTab] = useState<Tab>('search')
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    query: params.get('q') ?? '',
  })
  const [roleId, setRoleId] = useState<string>('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchName, setSearchName] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const skills = useSkillsCatalog()
  const languages = useLanguagesCatalog()
  const castings = useOrgCastings(organization?.id)
  const savedTalents = useSavedTalents(profileId)
  const saveTalent = useSaveTalent(profileId)
  const savedSearches = useSavedSearches(profileId)
  const savedSearchMutations = useSavedSearchMutations(profileId)

  const results = useTalentSearch({
    query: filters.query,
    city: filters.city,
    gender: filters.gender || null,
    playingAge: filters.playingAge ? Number(filters.playingAge) : null,
    language: filters.language || null,
    skill: filters.skill || null,
  })

  const roles: RoleRow[] = (castings.data ?? []).flatMap((casting) => casting.roles)
  const role = roles.find((item) => item.id === roleId) ?? null
  const languageName = (code: string) =>
    (languages.data ?? []).find((language) => language.code === code)?.name ?? code

  const savedIds = useMemo(() => new Set(savedTalents.data ?? []), [savedTalents.data])

  const rows = useMemo(() => {
    const list = (results.data ?? [])
      .filter((talent) => (filters.savedOnly ? savedIds.has(talent.profileId) : true))
      .filter((talent) =>
        filters.experience ? talent.experienceLevel === filters.experience : true,
      )
      .map((talent) => ({
        talent,
        match: role ? matchTalentToRole(talent, role, languageName) : null,
      }))

    if (role) list.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.data, role, filters.savedOnly, filters.experience, savedIds, languages.data])

  const roleIds = roles.map((item) => item.id)
  const candidates = useCandidatesForRoles(roleIds)

  /** What this talent has already done with *this* organization. */
  const historyOf = (talentId: string) => {
    const own = (candidates.data ?? []).filter((candidate) => candidate.talent_id === talentId)
    return {
      auditions: own.length,
      callbacks: own.filter((candidate) =>
        ['callback', 'offer', 'cast'].includes(candidate.status),
      ).length,
    }
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    if (key === 'query') {
      const next = new URLSearchParams(params)
      if (String(value).trim()) next.set('q', String(value))
      else next.delete('q')
      setParams(next, { replace: true })
    }
  }

  function exportCsv() {
    const chosen = rows.filter(
      ({ talent }) => selected.size === 0 || selected.has(talent.profileId),
    )
    if (chosen.length === 0) {
      setError('Nothing to export')
      return
    }
    const header = ['Name', 'City', 'Headline', 'Playing age', 'Gender', 'Skills', 'Languages', 'Match']
    const lines = chosen.map(({ talent, match }) =>
      [
        talent.name,
        talent.city ?? '',
        talent.headline ?? '',
        talent.playingAgeMin && talent.playingAgeMax
          ? `${talent.playingAgeMin}-${talent.playingAgeMax}`
          : '',
        talent.gender ?? '',
        talent.skills.join('; '),
        talent.languages.join('; '),
        match ? `${match.score}%` : '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )

    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `let-it-cast-shortlist-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast(`Exported ${chosen.length} talent${chosen.length === 1 ? '' : 's'}`)
  }

  const activeFilterCount = [
    filters.city,
    filters.gender,
    filters.playingAge,
    filters.language,
    filters.skill,
    filters.experience,
    filters.hasReel ? 'reel' : '',
    filters.savedOnly ? 'saved' : '',
  ].filter(Boolean).length

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            Talent recruiter
          </span>
          <h1 className="mt-1.5 font-display text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[2.6rem]">
            Find your next talent
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
          >
            Export shortlist
          </Button>
          <Link
            to="/studio/casting-calls/new"
            className="inline-flex h-10 items-center gap-2 rounded-btn bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'rounded-full px-4 py-2 text-[14px] font-semibold transition-colors',
              tab === item ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
            )}
          >
            {TAB_LABEL[item]}
          </button>
        ))}
      </nav>

      {error && <FormError>{error}</FormError>}

      {tab === 'search' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* search + match */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px] flex-1">
                <Input
                  fieldSize="lg"
                  icon={<Search className="h-[18px] w-[18px]" />}
                  placeholder="Try “vulnerable, drama, Marseille”…"
                  value={filters.query}
                  onChange={(event) => update('query', event.target.value)}
                />
              </div>
              <SelectInput
                fieldSize="lg"
                aria-label="Score against one of your roles"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                className="w-[260px]"
              >
                <option value="">Score against a role…</option>
                {roles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </div>

            {role && (
              <p className="flex items-center gap-2 rounded-field bg-cream/60 px-3.5 py-2.5 text-[13px] text-ink">
                <Sparkles className="h-4 w-4 shrink-0" />
                Scored against <span className="font-bold">{role.name}</span> — playing age, gender,
                languages, skills and location, each weighted. Hover a score for the breakdown.
              </p>
            )}

            {/* result bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] font-bold text-ink">
                {results.isLoading
                  ? 'Searching…'
                  : `${rows.length} talent${rows.length === 1 ? '' : 's'}`}
                {activeFilterCount > 0 && (
                  <span className="ml-2 text-[13px] font-normal text-muted">
                    {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} on
                  </span>
                )}
              </span>

              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <span className="text-[13px] text-muted">{selected.size} selected</span>
                )}
                <button
                  onClick={() => setFiltersOpen((value) => !value)}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-btn border px-3.5 text-[13px] font-semibold transition-colors xl:hidden',
                    filtersOpen || activeFilterCount > 0
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-card text-ink',
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="font-mono text-[11px]">{activeFilterCount}</span>
                  )}
                </button>
                <div className="flex items-center rounded-btn border border-line bg-card p-0.5">
                  <button
                    onClick={() => setView('list')}
                    aria-label="List view"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-inner',
                      view === 'list' ? 'bg-ink text-white' : 'text-muted',
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setView('grid')}
                    aria-label="Grid view"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-inner',
                      view === 'grid' ? 'bg-ink text-white' : 'text-muted',
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {results.error && (
              <FormError>{errorMessage(results.error, 'Could not search talents')}</FormError>
            )}

            {results.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No talent matches"
                description="Loosen a filter, or invite the talent you are looking for to join Let It Cast."
              />
            ) : view === 'list' ? (
              <ul className="flex flex-col gap-3">
                {rows.map(({ talent, match }) => (
                  <li key={talent.profileId}>
                    <TalentRow
                      talent={talent}
                      match={match}
                      history={historyOf(talent.profileId)}
                      saved={savedIds.has(talent.profileId)}
                      selected={selected.has(talent.profileId)}
                      onSelect={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (checked) next.add(talent.profileId)
                          else next.delete(talent.profileId)
                          return next
                        })
                      }
                      onSave={() =>
                        saveTalent.mutate({
                          talentId: talent.profileId,
                          saved: savedIds.has(talent.profileId),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ talent, match }) => (
                  <li key={talent.profileId}>
                    <Link to={`/studio/talent/${talent.profileId}`}>
                      <Card interactive className="flex h-full flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={talent.avatarUrl ?? undefined}
                            name={talent.name}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-[16px] font-bold text-ink">
                              {talent.name}
                            </p>
                            <p className="truncate text-[13px] text-muted">
                              {talent.headline ?? 'Talent'}
                            </p>
                          </div>
                          {match && <MatchRing score={match.score} />}
                        </div>
                        {talent.skills.length > 0 && (
                          <div className="mt-auto flex flex-wrap gap-1.5">
                            {talent.skills.slice(0, 3).map((skill) => (
                              <Tag key={skill}>{skill}</Tag>
                            ))}
                          </div>
                        )}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > 0 && (
              <p className="text-[13px] text-muted">
                Showing {rows.length} of {results.data?.length ?? rows.length} talent
                {(results.data?.length ?? 0) === 1 ? '' : 's'} on the platform.
              </p>
            )}
          </div>

          {/* ── Filters rail: a column on desktop, a panel on demand below xl ── */}
          <aside
            className={cn(
              'flex min-w-0 flex-col gap-4',
              filtersOpen ? 'order-first' : 'hidden xl:flex',
            )}
          >
            <Card className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className="font-display text-[17px] font-bold text-ink">Filters</span>
                <button
                  onClick={() => setFilters({ ...EMPTY_FILTERS, query: filters.query })}
                  className="inline-flex h-9 shrink-0 items-center rounded-btn px-2 text-[13px] font-semibold text-link hover:bg-link/5"
                >
                  Reset
                </button>
              </div>

              <FilterBlock label="Location">
                <Input
                  icon={<MapPin className="h-4 w-4" />}
                  placeholder="Search cities…"
                  value={filters.city}
                  onChange={(event) => update('city', event.target.value)}
                />
              </FilterBlock>

              <FilterBlock label="Plays this age">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  placeholder="e.g. 32"
                  value={filters.playingAge}
                  onChange={(event) => update('playingAge', event.target.value)}
                />
              </FilterBlock>

              <FilterBlock label="Gender">
                <SelectInput
                  value={filters.gender}
                  onChange={(event) => update('gender', event.target.value)}
                >
                  <option value="">Any</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                </SelectInput>
              </FilterBlock>

              <FilterBlock label="Language">
                <SelectInput
                  value={filters.language}
                  onChange={(event) => update('language', event.target.value)}
                >
                  <option value="">Any</option>
                  {(languages.data ?? []).map((language) => (
                    <option key={language.code} value={language.name}>
                      {language.name}
                    </option>
                  ))}
                </SelectInput>
              </FilterBlock>

              <FilterBlock label="Skill">
                <SelectInput
                  value={filters.skill}
                  onChange={(event) => update('skill', event.target.value)}
                >
                  <option value="">Any</option>
                  {(skills.data ?? []).map((skill) => (
                    <option key={skill.id} value={skill.name}>
                      {skill.name}
                    </option>
                  ))}
                </SelectInput>
              </FilterBlock>

              <FilterBlock label="Experience">
                <SelectInput
                  value={filters.experience}
                  onChange={(event) => update('experience', event.target.value)}
                >
                  <option value="">Any</option>
                  {['Emerging', 'Mid-career', 'Established', 'Star'].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </SelectInput>
              </FilterBlock>

              <label className="flex items-center gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={filters.savedOnly}
                  onChange={(event) => update('savedOnly', event.target.checked)}
                  className="h-4 w-4 rounded-[6px] border-line accent-ink"
                />
                Saved talents only
              </label>
            </Card>

            <Card className="flex flex-col gap-3">
              <span className="tech-label">Save this search</span>
              <Input
                placeholder="Name it — “Leads, 30s, French”"
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!searchName.trim() || savedSearchMutations.save.isPending}
                icon={savedSearchMutations.save.isPending ? <Spinner /> : undefined}
                onClick={async () => {
                  setError(null)
                  try {
                    await savedSearchMutations.save.mutateAsync({
                      name: searchName,
                      filters: { ...filters, roleId },
                    })
                    setSearchName('')
                    toast('Search saved')
                  } catch (saveError) {
                    setError(errorMessage(saveError, 'Could not save this search'))
                  }
                }}
              >
                Save search
              </Button>
            </Card>
          </aside>
        </div>
      )}

      {/* ── My campaigns ── */}
      {tab === 'campaigns' && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-[19px] font-bold text-ink">My campaigns</h2>
          {castings.isLoading ? (
            <Skeleton className="h-24" />
          ) : (castings.data?.length ?? 0) === 0 ? (
            <EmptyState
              compact
              title="No campaign yet"
              description="A campaign is a casting call with its roles."
              action={
                <Link
                  to="/studio/casting-calls/new"
                  className="inline-flex h-10 items-center rounded-field bg-ink px-4 text-[14px] font-bold text-white"
                >
                  New campaign
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {(castings.data ?? []).map((casting) => (
                <li key={casting.id}>
                  <Link
                    to={`/studio/casting/${casting.id}`}
                    className="flex items-center gap-3 py-3 first:pt-0"
                  >
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-btn bg-line">
                      {casting.project?.poster_url && (
                        <img
                          src={casting.project.poster_url}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-ink">
                        {casting.project?.title ?? casting.title}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {casting.roles.length} role{casting.roles.length === 1 ? '' : 's'} ·{' '}
                        {casting.status}
                      </span>
                    </span>
                    <Tag tone={casting.status === 'published' ? 'good' : 'neutral'}>
                      {casting.status}
                    </Tag>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ── Pipeline ── */}
      {tab === 'pipeline' && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-[19px] font-bold text-ink">Pipeline</h2>
            <p className="mt-1 text-[14px] text-muted">
              Everyone who applied to your roles, by stage.
            </p>
          </div>

          {candidates.isLoading ? (
            <Skeleton className="h-32" />
          ) : (candidates.data?.length ?? 0) === 0 ? (
            <EmptyState compact title="Nobody in the pipeline yet" />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['New', ['submitted']],
                  ['In review', ['viewed', 'under_review']],
                  ['Shortlist', ['shortlisted']],
                  ['Callback & beyond', ['callback', 'offer', 'cast']],
                ] as const
              ).map(([label, statuses]) => {
                const column = (candidates.data ?? []).filter((candidate) =>
                  (statuses as readonly string[]).includes(candidate.status),
                )
                return (
                  <div key={label} className="flex min-w-0 flex-col gap-2 rounded-field bg-paper p-3">
                    <span className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {label}
                      <span className="font-mono">{column.length}</span>
                    </span>
                    {column.length === 0 ? (
                      <span className="text-[13px] text-muted">—</span>
                    ) : (
                      column.map((candidate) => (
                        <Link
                          key={candidate.application_id}
                          to={`/studio/casting/${candidate.casting_call_id}?tab=submissions`}
                          className="flex items-center gap-2 rounded-btn bg-card p-2 shadow-card"
                        >
                          <Avatar
                            src={candidate.avatar_url ?? undefined}
                            name={candidate.name}
                            size="xs"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">
                              {candidate.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {candidate.role_name}
                            </span>
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Saved searches ── */}
      {tab === 'saved' && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-[19px] font-bold text-ink">Saved searches</h2>
          {savedSearches.isLoading ? (
            <Skeleton className="h-20" />
          ) : (savedSearches.data?.length ?? 0) === 0 ? (
            <EmptyState
              compact
              title="No saved search"
              description="Set your filters on the Search tab and save them to come back to them."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {(savedSearches.data ?? []).map((search) => (
                <li key={search.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">
                      {search.name}
                    </span>
                    <span className="block text-[12px] text-muted">
                      saved {relativeTime(search.created_at)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const stored = search.filters as Partial<Filters> & { roleId?: string }
                      setFilters({ ...EMPTY_FILTERS, ...stored })
                      setRoleId(stored.roleId ?? '')
                      setTab('search')
                      toast(`Applied “${search.name}”`)
                    }}
                  >
                    Apply
                  </Button>
                  <button
                    onClick={() => savedSearchMutations.remove.mutate(search.id)}
                    aria-label={`Delete ${search.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold text-ink">{label}</span>
      {children}
    </div>
  )
}

function MatchRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 20
  const tone = score >= 75 ? '#2BA36B' : score >= 50 ? '#F4B400' : '#E0483D'

  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="20" fill="none" stroke="#ECEAE4" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="relative font-mono text-[12px] font-bold text-ink">{score}%</span>
    </span>
  )
}

function TalentRow({
  talent,
  match,
  history,
  saved,
  selected,
  onSelect,
  onSave,
}: {
  talent: TalentSearchResult
  match: ReturnType<typeof matchTalentToRole> | null
  history: { auditions: number; callbacks: number }
  saved: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="flex flex-wrap items-center gap-4">
      <input
        type="checkbox"
        aria-label={`Select ${talent.name}`}
        checked={selected}
        onChange={(event) => onSelect(event.target.checked)}
        className="hidden h-4 w-4 shrink-0 rounded-[6px] border-line accent-ink sm:block"
      />

      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-card bg-line">
        {talent.avatarUrl ? (
          <img src={talent.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-[18px] font-bold text-muted">
            {talent.name.slice(0, 1)}
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/studio/talent/${talent.profileId}`}
            className="-my-1 inline-flex items-center py-1 font-display text-[16px] font-bold text-ink hover:underline"
          >
            {talent.name}
          </Link>
          {talent.availability && (
            <Tag tone={talent.availability === 'available' ? 'good' : 'neutral'}>
              {talent.availability === 'available'
                ? 'Available'
                : talent.availability === 'on_project'
                  ? 'On project'
                  : 'Unavailable'}
            </Tag>
          )}
          {talent.experienceLevel && <Tag tone="cream">{talent.experienceLevel}</Tag>}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {[
            talent.playingAgeMin && talent.playingAgeMax
              ? `plays ${talent.playingAgeMin}–${talent.playingAgeMax}`
              : null,
            [talent.city, talent.country].filter(Boolean).join(', ') || null,
            talent.languages.slice(0, 3).join(', ') || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {talent.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {talent.skills.slice(0, 3).map((skill) => (
              <Tag key={skill}>{skill}</Tag>
            ))}
            {talent.skills.length > 3 && (
              <span className="text-[12px] text-muted">+{talent.skills.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <div className="hidden shrink-0 gap-6 sm:flex">
        <span className="text-center">
          <span className="block font-display text-[16px] font-extrabold text-ink">
            {history.auditions}
          </span>
          <span className="block text-[11px] text-muted">With you</span>
        </span>
        <span className="text-center">
          <span className="block font-display text-[16px] font-extrabold text-ink">
            {history.callbacks}
          </span>
          <span className="block text-[11px] text-muted">Callbacks</span>
        </span>
      </div>

      {match && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex shrink-0 flex-col items-center"
          aria-label={`Match breakdown for ${talent.name}`}
        >
          <MatchRing score={match.score} />
          <span className="mt-1 text-[11px] text-muted">Match</span>
        </button>
      )}

      <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
        <button
          onClick={onSave}
          aria-label={saved ? `Remove ${talent.name} from saved` : `Save ${talent.name}`}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors sm:h-9 sm:w-9',
            saved
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-card text-muted hover:border-ink/30 hover:text-ink',
          )}
        >
          <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
        </button>
        <Link
          to={`/studio/talent/${talent.profileId}`}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-field border border-line bg-card px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-paper sm:h-9 sm:flex-none"
        >
          <Play className="h-3.5 w-3.5" />
          View profile
        </Link>
      </div>

      {match && open && (
        <div className="w-full rounded-field bg-paper p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
              Why {match.score}%
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-3.5 w-3.5 text-muted" />
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {match.breakdown.map((item) => (
              <li
                key={item.label}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px]',
                  item.possible === 0
                    ? 'bg-card text-muted'
                    : item.met
                      ? 'bg-signal-good-bg text-signal-good'
                      : 'bg-signal-no/10 text-signal-no',
                )}
              >
                {item.label}
                {item.possible > 0 ? ` · ${item.earned}/${item.possible}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
