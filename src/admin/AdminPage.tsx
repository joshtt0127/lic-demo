import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Building2, Flag, History, Search, ShieldOff, User } from 'lucide-react'
import { Button, Card, FormError, Input, Logo, Spinner, Tag } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  useAdminActions,
  useAdminSearch,
  useAdminTrail,
  useClientErrors,
  useOpsHealth,
  useReportQueue,
} from '@/features/admin/queries'
import { relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

/**
 * La console LIC.
 *
 * Elle ne fait rien que la base ne lui permette : les policies et les fonctions
 * de la migration 7.1 décident, cet écran demande. Un support qui essaie de
 * clore un dossier reçoit un refus de la base, pas un bouton grisé — c'est ce
 * qui garantit qu'elle ne pourra pas dériver en « God Mode » par une évolution
 * d'interface.
 *
 * Trois onglets, qui suivent ce que fait une journée de support : la file, la
 * recherche, et ce qui a été fait.
 */
type Tab = 'health' | 'reports' | 'search' | 'trail'

/** Demande un motif, et n'accepte pas le silence. Toute action en passe par là. */
function askReason(question: string): string | null {
  const reason = window.prompt(question)
  if (reason === null) return null
  if (!reason.trim()) {
    window.alert('A reason is required — it is what makes the action accountable.')
    return null
  }
  return reason.trim()
}

export function AdminPage() {
  const t = useT()
  const toast = useToast()
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('health')
  const [error, setError] = useState<string | null>(null)

  const isAdmin = profile?.platform_role === 'admin'

  return (
    <div className="min-h-[100dvh] bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1000px] items-center gap-3 px-5 sm:px-8">
          <Link to="/" className="-my-1 flex items-center py-1">
            <Logo size={24} />
          </Link>
          <span className="tech-label">Let It Cast · operations</span>
          <Tag tone={isAdmin ? 'gold' : 'neutral'} className="ml-auto">
            {isAdmin ? 'Admin' : 'Support'}
          </Tag>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-5 py-6 sm:px-8">
        <SegmentedControl
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            { value: 'health', label: 'Health' },
            { value: 'reports', label: 'Reports' },
            { value: 'search', label: 'Search' },
            { value: 'trail', label: 'Trail' },
          ]}
        />

        {error && <FormError>{error}</FormError>}

        {tab === 'health' && <Health />}
        {tab === 'reports' && <Reports isAdmin={isAdmin} onError={setError} toast={toast} />}
        {tab === 'search' && <SearchPanel isAdmin={isAdmin} onError={setError} toast={toast} />}
        {tab === 'trail' && <Trail />}

        <p className="pb-4 text-[12px] leading-relaxed text-muted">{t('admin.principle')}</p>
      </main>
    </div>
  )
}

/**
 * L'état de santé.
 *
 * Sept compteurs, pas un tableau de bord : ce sont les seuls chiffres qui, s'ils
 * dérivent, veulent dire qu'un parcours critique est cassé. Un écran qui montre
 * tout ne se regarde pas ; celui-ci tient en un coup d'œil, et se met à jour
 * tout seul.
 */
function Health() {
  const t = useT()
  const health = useOpsHealth()
  const errors = useClientErrors()

  const cells: { label: string; value: number | undefined; bad: boolean }[] = [
    { label: t('ops.emailsNotSent'), value: health.data?.emails_not_sent_24h, bad: (health.data?.emails_not_sent_24h ?? 0) > 0 },
    { label: t('ops.emailsStuck'), value: health.data?.emails_stuck, bad: (health.data?.emails_stuck ?? 0) > 0 },
    { label: t('ops.aiFailures'), value: health.data?.ai_failures_24h, bad: (health.data?.ai_failures_24h ?? 0) > 0 },
    { label: t('ops.aiStuck'), value: health.data?.ai_stuck, bad: (health.data?.ai_stuck ?? 0) > 0 },
    { label: t('ops.clientErrors'), value: health.data?.client_errors_24h, bad: (health.data?.client_errors_24h ?? 0) > 0 },
    { label: t('ops.reportsOpen'), value: health.data?.reports_open, bad: (health.data?.reports_open ?? 0) > 0 },
    { label: t('ops.deletionsPending'), value: health.data?.deletions_pending, bad: (health.data?.deletions_pending ?? 0) > 0 },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          {t('ops.health')}
        </span>

        {health.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cells.map((cell) => (
              <div
                key={cell.label}
                className={`rounded-field border p-3 ${
                  cell.bad ? 'border-signal-no/30 bg-signal-no/5' : 'border-line bg-paper'
                }`}
              >
                <p className="font-mono text-[20px] font-bold text-ink">{cell.value ?? '—'}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">{cell.label}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="tech-label">{t('ops.lastErrors')}</span>
        {errors.isLoading ? (
          <Spinner />
        ) : (errors.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">{t('ops.noErrors')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {(errors.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-2 py-2">
                <Tag tone="no">{item.kind}</Tag>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.message}</span>
                <span className="font-mono text-[12px] text-muted">{item.route}</span>
                <span className="text-[12px] text-muted">{relativeTime(item.occurred_at, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Reports({
  isAdmin,
  onError,
  toast,
}: {
  isAdmin: boolean
  onError: (message: string | null) => void
  toast: (message: string) => void
}) {
  const t = useT()
  const [status, setStatus] = useState<'open' | 'in_review' | 'resolved' | 'dismissed'>('open')
  const queue = useReportQueue(status)
  const { setReportStatus } = useAdminActions()

  function act(id: string, next: 'in_review' | 'resolved' | 'dismissed') {
    onError(null)
    const resolution =
      next === 'in_review' ? undefined : (askReason('What did you conclude?') ?? undefined)
    if (next !== 'in_review' && !resolution) return
    setReportStatus.mutate(
      { id, status: next, resolution },
      {
        onSuccess: () => toast('Report updated'),
        onError: (actionError) => onError(errorMessage(actionError, 'This report could not be updated')),
      },
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Flag className="h-3.5 w-3.5" />
          {t('admin.reports')}
        </span>
        <SegmentedControl
          value={status}
          onChange={(value) => setStatus(value as typeof status)}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'in_review', label: 'In review' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
      </div>

      {queue.isLoading ? (
        <Spinner />
      ) : (queue.data ?? []).length === 0 ? (
        <EmptyState icon={<Flag className="h-5 w-5" />} title={t("admin.noReports")} />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {(queue.data ?? []).map((report) => (
            <li key={report.id} className="flex flex-wrap items-start gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Tag tone="no">{t(`moderation.reason.${report.reason}`)}</Tag>
                  <span className="text-[12.5px] text-muted">
                    {report.subject_type} · {relativeTime(report.created_at, t)}
                  </span>
                </span>
                {report.details && (
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-ink/90">
                    {report.details}
                  </span>
                )}
                {report.resolution && (
                  <span className="mt-1 block text-[12.5px] text-muted">→ {report.resolution}</span>
                )}
              </span>

              <span className="flex shrink-0 flex-wrap gap-2">
                {status === 'open' && (
                  <Button size="sm" variant="secondary" onClick={() => act(report.id, 'in_review')}>
                    Take it
                  </Button>
                )}
                {isAdmin && status !== 'resolved' && status !== 'dismissed' && (
                  <>
                    <Button size="sm" onClick={() => act(report.id, 'resolved')}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(report.id, 'dismissed')}>
                      Dismiss
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SearchPanel({
  isAdmin,
  onError,
  toast,
}: {
  isAdmin: boolean
  onError: (message: string | null) => void
  toast: (message: string) => void
}) {
  const t = useT()
  const [term, setTerm] = useState('')
  const results = useAdminSearch(term)
  const { setOrganizationStatus, setUserSuspended } = useAdminActions()

  return (
    <Card className="flex flex-col gap-4">
      <span className="tech-label inline-flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        {t('admin.search')}
      </span>

      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t('admin.searchPlaceholder')}
        aria-label={t('admin.search')}
        icon={<Search className="h-[18px] w-[18px]" />}
      />

      {results.data && (
        <div className="flex flex-col gap-4">
          <Section icon={User} title={t('admin.people')}>
            {results.data.people.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                  {[person.first_name, person.last_name].filter(Boolean).join(' ') || person.id}
                  <span className="ml-2 text-[12.5px] text-muted">{person.account_type}</span>
                </span>
                {person.suspended_at && <Tag tone="no">Suspended</Tag>}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant={person.suspended_at ? 'secondary' : 'ghost'}
                    icon={<ShieldOff className="h-3.5 w-3.5" />}
                    onClick={() => {
                      const reason = askReason(
                        person.suspended_at ? 'Why lift this suspension?' : 'Why suspend this account?',
                      )
                      if (!reason) return
                      onError(null)
                      setUserSuspended.mutate(
                        { profileId: person.id, suspended: !person.suspended_at, reason },
                        {
                          onSuccess: () => toast('Done — and recorded'),
                          onError: (actionError) =>
                            onError(errorMessage(actionError, 'This account could not be updated')),
                        },
                      )
                    }}
                  >
                    {person.suspended_at ? 'Restore' : 'Suspend'}
                  </Button>
                )}
              </li>
            ))}
          </Section>

          <Section icon={Building2} title={t('admin.organizations')}>
            {results.data.organizations.map((organization) => (
              <li key={organization.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                  {organization.name}
                </span>
                <Tag tone={organization.verification_status === 'verified' ? 'good' : 'neutral'}>
                  {organization.verification_status}
                </Tag>
                {isAdmin &&
                  (['verified', 'suspended'] as const).map((next) =>
                    organization.verification_status === next ? null : (
                      <Button
                        key={next}
                        size="sm"
                        variant={next === 'verified' ? 'secondary' : 'ghost'}
                        onClick={() => {
                          const reason = askReason(`Why ${next === 'verified' ? 'verify' : 'suspend'}?`)
                          if (!reason) return
                          onError(null)
                          setOrganizationStatus.mutate(
                            { orgId: organization.id, status: next, reason },
                            {
                              onSuccess: () => toast('Done — and recorded'),
                              onError: (actionError) =>
                                onError(
                                  errorMessage(actionError, 'This organization could not be updated'),
                                ),
                            },
                          )
                        }}
                      >
                        {next === 'verified' ? 'Verify' : 'Suspend'}
                      </Button>
                    ),
                  )}
              </li>
            ))}
          </Section>

          <Section icon={Flag} title={t('admin.castings')}>
            {results.data.castings.map((casting) => (
              <li key={casting.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{casting.title}</span>
                <Tag tone="neutral">{casting.status}</Tag>
              </li>
            ))}
          </Section>
        </div>
      )}
    </Card>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User
  title: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </span>
      {items.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">—</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{children}</ul>
      )}
    </div>
  )
}

function Trail() {
  const t = useT()
  const trail = useAdminTrail()

  return (
    <Card className="flex flex-col gap-3">
      <span className="tech-label inline-flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" />
        {t('admin.trail')}
      </span>

      {trail.isLoading ? (
        <Spinner />
      ) : (trail.data ?? []).length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title={t("admin.noTrail")} />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {(trail.data ?? []).map((action) => (
            <li key={action.id} className="flex flex-wrap items-baseline gap-2 py-2">
              <span className="font-mono text-[12.5px] text-ink">{action.action}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{action.reason}</span>
              <span className="text-[12px] text-muted">{relativeTime(action.created_at, t)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
