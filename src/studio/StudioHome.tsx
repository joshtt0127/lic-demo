import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ArrowRight, AudioLines, ChevronRight, Clapperboard, FileText, Play, Sparkles } from 'lucide-react'
import { Card, FormError } from '@/components/ui'
import { EditModal } from '@/components/EditModal'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import {
  useStudioOverview,
  type AgendaItem,
  type AttentionItem,
  type CastingOverview,
} from '@/features/studio/queries'
import { formatDateShort, greeting } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { NewCastingButton } from './StudioLayout'

/**
 * Studio home, from the design: the greeting, the session card, "Your castings"
 * and "Needs your attention".
 *
 * Every number is derived from the organization's own rows — castings, roles and
 * the applications talents actually submitted.
 */
export function StudioHome() {
  const [sessionOpen, setSessionOpen] = useState(false)
  const { profile } = useAuth()
  const { organization, isLoading: orgLoading } = useCurrentOrganization(profile?.id)
  const overview = useStudioOverview(organization?.id)

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  if (orgLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-96" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!organization) {
    return (
      <EmptyState
        icon={<Clapperboard className="h-5 w-5" />}
        title="You do not belong to an organization yet"
        description="Projects, castings and candidates live inside a team. Create yours to start casting."
        action={
          <Link
            to="/onboarding"
            className="inline-flex h-11 items-center rounded-field bg-ink px-5 text-[14px] font-bold text-white"
          >
            Set up my organization
          </Link>
        }
      />
    )
  }

  const data = overview.data

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      {/* ── Greeting ── */}
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <span className="text-[13px] text-muted">{today}</span>
          <h1 className="mt-1 font-display text-[2.1rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[3.1rem] xl:text-[3.5rem]">
            {greeting()}, {profile?.first_name ?? 'there'}.
          </h1>
          <p className="mt-2 text-[16px] text-muted sm:text-[19px]">
            {data && data.attention.length > 0
              ? 'Here’s what needs your attention today.'
              : 'Nothing is waiting on you right now.'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-4">
          <NewCastingButton />
          <p className="hidden max-w-[190px] text-right font-display text-[13px] italic leading-snug text-muted sm:block">
            “Great stories start with great people.”
          </p>
        </div>
      </header>

      {overview.error && (
        <FormError>{errorMessage(overview.error, 'Could not load your castings')}</FormError>
      )}

      {/* ── Session card ── */}
      <SessionCard
        loading={overview.isLoading}
        tapes={data?.tapesToReview ?? 0}
        callbacks={data?.callbacksWaiting ?? 0}
        newSubmissions={data?.newSubmissions ?? 0}
        onPrepare={() => setSessionOpen(true)}
        reviewHref={
          data?.castings.find((item) => item.tapesToReview > 0)?.casting.id
            ? `/studio/casting/${data.castings.find((item) => item.tapesToReview > 0)!.casting.id}`
            : '/studio/casting-calls'
        }
      />

      {/* ── Two columns ── */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[19px] font-bold text-ink">Your castings</h2>
            <Link
              to="/studio/casting-calls"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {overview.isLoading ? (
            <Skeleton className="h-40" />
          ) : (data?.castings.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<Clapperboard className="h-5 w-5" />}
              title="No casting call yet"
              description="Create one and publish its roles — talents see them straight away."
              action={<NewCastingButton className="h-11 px-5 text-[14px]" />}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data!.castings.slice(0, 5).map((item) => (
                <CastingRow key={item.casting.id} item={item} />
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[19px] font-bold text-ink">
              Needs your attention
              {(data?.attention.length ?? 0) > 0 && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-signal-no px-1.5 font-mono text-[11px] font-bold text-white">
                  {data!.attention.length}
                </span>
              )}
            </h2>
            <Link
              to="/studio/casting-calls"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {overview.isLoading ? (
            <Skeleton className="h-40" />
          ) : (data?.attention.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<Sparkles className="h-5 w-5" />}
              title="Nothing waiting on you"
              description="New applications, tapes to review and closing deadlines appear here."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data!.attention.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Agenda ── */}
      {(data?.agenda.length ?? 0) > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[19px] font-bold text-ink">Coming up</h2>
            <Link
              to="/studio/calendar"
              className="text-[13px] font-semibold text-muted hover:text-ink"
            >
              Calendar
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {data!.agenda.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-line/60"
                >
                  <span className="font-mono text-[11px] text-muted">
                    {formatDateShort(item.date)}
                  </span>
                  {item.label} · {item.detail}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sessionOpen && (
        <SessionPanel
          attention={data?.attention ?? []}
          agenda={data?.agenda ?? []}
          onClose={() => setSessionOpen(false)}
        />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="font-display text-[14px] italic text-muted">
          “Casting is how a story finds its people.”
        </p>
        <span className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
          <span className="h-[2px] w-7 bg-ink/30" />
          Let It Cast
        </span>
      </footer>
    </div>
  )
}

function SessionCard({
  loading,
  tapes,
  callbacks,
  newSubmissions,
  reviewHref,
  onPrepare,
}: {
  loading: boolean
  tapes: number
  callbacks: number
  newSubmissions: number
  reviewHref: string
  onPrepare: () => void
}) {
  const nothing = tapes === 0 && callbacks === 0 && newSubmissions === 0

  return (
    <div className="relative overflow-hidden rounded-panel border border-white/70 bg-[#FBFAF7] px-6 py-8 shadow-panel sm:px-9 lg:px-10 lg:py-9">
      {/* brand decoration, as in the design */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] sm:block">
        <div className="absolute inset-0 opacity-70 blur-3xl">
          <div className="absolute right-[26%] top-[8%] h-40 w-40 rounded-full bg-[#F7D98A]" />
          <div className="absolute right-[10%] top-[38%] h-32 w-32 rounded-full bg-[#F7B3AE]" />
          <div className="absolute bottom-0 right-[34%] h-44 w-44 rounded-full bg-[#AFC6F7]" />
        </div>
        <div className="absolute right-[20%] top-[12%] h-28 w-28 rotate-[12deg] rounded-[1.8rem] bg-gradient-to-br from-[#FFD447] to-[#F6B63C] shadow-[0_22px_50px_-22px_rgba(246,182,60,0.75)]" />
        <div className="absolute right-[7%] top-[36%] h-16 w-16 rotate-[-10deg] rounded-[1.2rem] bg-gradient-to-br from-[#FF6B60] to-[#E0483D] shadow-[0_22px_50px_-24px_rgba(224,72,61,0.7)]" />
        <div className="absolute -bottom-6 right-[26%] h-44 w-44 rotate-[6deg] rounded-[2.4rem] bg-gradient-to-br from-[#5B8DEF] to-[#2563EB] shadow-[0_26px_56px_-26px_rgba(37,99,235,0.7)]" />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#FBFAF7]/5 to-[#FBFAF7]" />
        <span className="absolute bottom-10 right-6 hidden text-right text-[10px] font-semibold uppercase leading-[1.8] tracking-[0.3em] text-muted lg:block">
          Act
          <br />
          Create
          <br />
          Belong
          <span className="mt-2 block h-[2px] w-6 bg-ink/25" />
        </span>
      </div>

      <div className="relative max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-13 w-13 items-center justify-center rounded-field bg-ink p-3.5 text-white">
            <AudioLines className="h-full w-full" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[19px] font-bold text-ink">Your session</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-good-bg px-2.5 py-0.5 text-[11px] font-semibold text-signal-good">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-good" />
                Live
              </span>
            </div>
            <p className="text-[14px] text-muted">
              Computed from your castings — no estimates, no placeholders.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="mt-6 h-16 w-full max-w-lg" />
        ) : (
          <p className="mt-7 font-display text-[1.45rem] font-semibold leading-[1.25] tracking-[-0.015em] text-ink sm:text-[1.9rem] lg:text-[2.15rem]">
            {nothing ? (
              <>
                Nothing to review yet. Publish a casting and the first tapes will land here.
              </>
            ) : (
              <>
                You have <span className="font-extrabold">{tapes} tape{tapes === 1 ? '' : 's'}</span> to
                review
                {callbacks > 0 && (
                  <>
                    {' '}
                    and <span className="font-extrabold">{callbacks} callback{callbacks === 1 ? '' : 's'}</span>{' '}
                    waiting
                  </>
                )}
                .
              </>
            )}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Link
            to={reviewHref}
            className="inline-flex h-12 items-center gap-2 rounded-field bg-ink px-5 text-[14px] font-bold text-white transition-colors hover:bg-ink/90"
          >
            <Play className="h-4 w-4" />
            Review tapes
          </Link>
          <button
            type="button"
            onClick={onPrepare}
            className="inline-flex h-12 items-center gap-2 rounded-field border border-line bg-card px-5 text-[14px] font-bold text-ink transition-colors hover:bg-paper"
          >
            <FileText className="h-4 w-4" />
            Prepare my session
          </button>
          <span
            title="The Cast Assistant needs the AI layer — not connected yet."
            className="inline-flex h-12 cursor-not-allowed items-center gap-2 rounded-field border border-dashed border-line bg-transparent px-5 text-[14px] font-semibold text-muted/70"
          >
            <Sparkles className="h-4 w-4" />
            Cast Assistant — coming with the AI layer
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * "Prepare my session": the running order of what needs a decision, built from
 * the same rows as the dashboard. No AI, no invention — a briefing.
 */
function SessionPanel({
  attention,
  agenda,
  onClose,
}: {
  attention: AttentionItem[]
  agenda: AgendaItem[]
  onClose: () => void
}) {
  return (
    <EditModal open title="Your session" onClose={onClose}>
      {attention.length === 0 ? (
        <EmptyState
          compact
          icon={<Sparkles className="h-5 w-5" />}
          title="Nothing needs you"
          description="No tape to review, no decision pending."
        />
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {attention.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper font-mono text-[12px] font-bold text-ink">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">{item.title}</span>
                <span className="block truncate text-[12px] text-muted">{item.subtitle}</span>
              </span>
              <Link
                to={item.href}
                onClick={onClose}
                className="shrink-0 text-[13px] font-semibold text-link hover:underline"
              >
                Open
              </Link>
            </li>
          ))}
        </ol>
      )}

      {agenda.length > 0 && (
        <div className="rounded-field bg-paper p-3">
          <span className="tech-label">Next dates</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {agenda.slice(0, 4).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-[13px] text-ink">
                <span className="font-mono text-[11px] text-muted">
                  {formatDateShort(item.date)}
                </span>
                {item.label} · {item.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </EditModal>
  )
}

const DOT_TONE: Record<AttentionItem['tone'], string> = {
  red: 'bg-signal-no',
  blue: 'bg-link',
  gold: 'bg-gold',
  grey: 'bg-line',
}

function CastingRow({ item }: { item: CastingOverview }) {
  const { casting } = item
  const tone: AttentionItem['tone'] =
    item.newSubmissions > 0 ? 'red' : casting.status === 'published' ? 'blue' : 'grey'

  return (
    <li>
      <Link
        to={`/studio/casting/${casting.id}`}
        className="group flex items-center gap-4 py-3 first:pt-0"
      >
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[11px] bg-line">
          {casting.project?.poster_url && (
            <img
              src={casting.project.poster_url}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          )}
        </span>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONE[tone])} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">
            {casting.project?.title ?? casting.title}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {[casting.project?.production_type, casting.project?.company_name]
              .filter(Boolean)
              .join(' · ') || casting.title}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              'block font-display text-[15px] font-extrabold',
              item.newSubmissions > 0 ? 'text-signal-no' : 'text-muted',
            )}
          >
            {item.newSubmissions > 0 ? `+${item.newSubmissions}` : item.submissions}
          </span>
          <span className="block text-[12px] text-muted">
            {item.newSubmissions > 0 ? 'New submissions' : 'Submissions'}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li>
      <Link to={item.href} className="group flex items-center gap-4 py-3 first:pt-0">
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[11px] bg-line">
          {item.posterUrl && (
            <img src={item.posterUrl} alt="" className="h-full w-full object-cover object-top" />
          )}
        </span>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONE[item.tone])} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{item.title}</span>
          <span className="block truncate text-[13px] text-muted">{item.subtitle}</span>
        </span>
        <span className="shrink-0 text-[13px] text-muted">{item.due}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}
