import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Clock,
  Download,
  Film,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Avatar, Button, Card, FormError, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useOrgAnalytics } from '@/features/studio/analytics'
import { APPLICATION_STATUS_LABEL, formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { colors } from '@/styles/tokens'
import { cn } from '@/lib/cn'

/**
 * Reports — the state of the organization's casting, counted from its own rows.
 *
 * Every figure here is derived from applications, reviews and notes: there is
 * no analytics table to drift from the screens. What cannot be counted
 * honestly (why someone dropped out, where they came from) is not shown.
 */
export function ReportsPage() {
  const toast = useToast()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const report = useOrgAnalytics(organization?.id)

  const data = report.data

  const hours = (value: number | null) => {
    if (value === null) return '—'
    if (value < 1) return `${Math.round(value * 60)} min`
    if (value < 48) return `${value.toFixed(1)} h`
    return `${Math.round(value / 24)} days`
  }

  const csv = useMemo(() => {
    if (!data) return ''
    const header = [
      'Name',
      'Role',
      'Status',
      'Score',
      'Self-tape',
      'Submitted',
      'City',
      'Experience',
    ]
    const rows = data.candidates.map((candidate) => [
      candidate.name,
      candidate.role_name,
      APPLICATION_STATUS_LABEL[candidate.status],
      String(candidate.score),
      candidate.has_self_tape ? 'yes' : 'no',
      candidate.submitted_at ?? '',
      candidate.city ?? '',
      candidate.experience_level ?? '',
    ])
    return [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }, [data])

  function exportCsv() {
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `let-it-cast-candidates-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast(`${data?.candidates.length ?? 0} candidates exported`)
  }

  if (report.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (report.error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <FormError>{errorMessage(report.error, 'Could not build your reports')}</FormError>
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => report.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (data.totals.candidates === 0) {
    return (
      <div className="flex flex-col gap-5">
        <Header count={0} onExport={exportCsv} disabled />
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title="Nothing to report yet"
          description="As soon as talents apply to your published roles, this page counts what happens to them."
        />
      </div>
    )
  }

  const top = data.funnel[0]?.count ?? 0

  return (
    <div className="flex flex-col gap-5">
      <Header count={data.candidates.length} onExport={exportCsv} />

      {/* ── The numbers that matter first ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Candidates" value={data.totals.candidates} detail={`${data.totals.tapes} with a tape`} />
        <Kpi
          label="Shortlisted"
          value={data.totals.shortlisted}
          detail={`${data.totals.cast} cast`}
        />
        <Kpi
          label="Roles filled"
          value={`${data.totals.rolesFilled}/${data.totals.roles}`}
          detail={`${data.totals.published} casting${data.totals.published === 1 ? '' : 's'} published`}
        />
        <Kpi
          label="Median first look"
          value={hours(data.medianHours.toFirstView)}
          detail={`decision ${hours(data.medianHours.toDecision)}`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {/* ── Funnel ── */}
        <Card className="flex flex-col gap-4">
          <div>
            <span className="tech-label">Funnel</span>
            <p className="mt-1 text-[13px] text-muted">
              Where the {data.totals.candidates} applications stand. A status counts for every
              step it has passed.
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {data.funnel.map((step) => (
              <li key={step.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] font-semibold text-ink">
                  {step.label}
                </span>
                <span className="h-7 min-w-[2px] flex-1 overflow-hidden rounded-btn bg-paper">
                  <span
                    className={cn(
                      'flex h-full items-center justify-end rounded-btn px-2 font-mono text-[11px] font-bold text-white transition-[width]',
                      step.key === 'cast' ? 'bg-gold text-ink' : 'bg-ink',
                    )}
                    style={{ width: `${top === 0 ? 0 : Math.max((step.count / top) * 100, 4)}%` }}
                  >
                    {step.count}
                  </span>
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[12px] text-muted">
                  {step.share}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Volume ── */}
        <Card className="flex flex-col gap-4">
          <div>
            <span className="tech-label">Applications per week</span>
            <p className="mt-1 text-[13px] text-muted">The last eight weeks, by submission date.</p>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.weekly} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="volume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.ink} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={colors.ink} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.line} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: colors.muted }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: colors.muted }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 14,
                    border: `1px solid ${colors.line}`,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="submissions"
                  stroke={colors.ink}
                  strokeWidth={2}
                  fill="url(#volume)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── What needs attention ── */}
      {data.risks.length > 0 && (
        <Card className="flex flex-col gap-3">
          <span className="tech-label inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs attention
          </span>
          <ul className="flex flex-col divide-y divide-line">
            {data.risks.slice(0, 6).map((risk) => (
              <li key={`${risk.roleId}-${risk.reason}`}>
                <Link
                  to={`/studio/casting/${risk.castingId}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {risk.roleName}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {risk.castingTitle}
                    </span>
                  </span>
                  <Tag tone="no">{risk.reason}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Casting by casting ── */}
      <Card className="flex flex-col gap-4">
        <span className="tech-label">By casting</span>

        {/* Téléphone : une carte par casting, avec ses chiffres en clair. */}
        <ul className="flex flex-col gap-2.5 sm:hidden">
          {data.perCasting.map((casting) => (
            <li key={casting.id} className="rounded-field border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/studio/casting/${casting.id}`} className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-ink">
                    {casting.projectTitle}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{casting.title}</span>
                </Link>
                <Tag tone={casting.status === 'published' ? 'good' : 'neutral'}>
                  {casting.status}
                </Tag>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                {[
                  ['Roles filled', `${casting.rolesFilled}/${casting.roles}`],
                  ['Candidates', String(casting.submissions)],
                  ['Tapes', String(casting.tapes)],
                  ['Shortlist', String(casting.shortlisted)],
                  ['Cast', String(casting.cast)],
                  ['Deadline', casting.deadlineAt ? formatDate(casting.deadlineAt) : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-mono font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                {['Casting', 'Status', 'Roles filled', 'Candidates', 'Tapes', 'Shortlist', 'Cast', 'Deadline'].map(
                  (head) => (
                    <th
                      key={head}
                      className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.perCasting.map((casting) => (
                <tr key={casting.id} className="border-b border-line/70 last:border-0">
                  <td className="px-2 py-3">
                    <Link
                      to={`/studio/casting/${casting.id}`}
                      className="block max-w-[260px] truncate text-[14px] font-bold text-ink hover:underline"
                    >
                      {casting.projectTitle}
                    </Link>
                    <span className="block max-w-[260px] truncate text-[12px] text-muted">
                      {casting.title}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <Tag tone={casting.status === 'published' ? 'good' : 'neutral'}>
                      {casting.status}
                    </Tag>
                  </td>
                  <td className="px-2 py-3 font-mono text-[13px] text-ink">
                    {casting.rolesFilled}/{casting.roles}
                  </td>
                  <td className="px-2 py-3 font-mono text-[13px] text-ink">{casting.submissions}</td>
                  <td className="px-2 py-3 font-mono text-[13px] text-muted">{casting.tapes}</td>
                  <td className="px-2 py-3 font-mono text-[13px] text-ink">{casting.shortlisted}</td>
                  <td className="px-2 py-3 font-mono text-[13px] text-ink">{casting.cast}</td>
                  <td className="px-2 py-3 text-[12.5px] text-muted">
                    {casting.deadlineAt ? formatDate(casting.deadlineAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Who reviewed ── */}
      <Card className="flex flex-col gap-4">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Team activity
        </span>
        <ul className="flex flex-col divide-y divide-line">
          {data.team.map((member) => (
            <li key={member.profileId} className="flex items-center gap-3 py-2.5 first:pt-0">
              <Avatar src={member.avatarUrl ?? undefined} name={member.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                {member.name}
              </span>
              <span className="shrink-0 text-[12.5px] text-muted">
                {member.reviews} vote{member.reviews === 1 ? '' : 's'} · {member.notes} note
                {member.notes === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">
          Counted from the votes and notes saved on your candidates.
        </p>
      </Card>
    </div>
  )
}

function Header({
  count,
  onExport,
  disabled,
}: {
  count: number
  onExport: () => void
  disabled?: boolean
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
          Reports
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Counted from your castings — nothing here is estimated.
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        icon={<Download className="h-3.5 w-3.5" />}
        onClick={onExport}
      >
        Export {count} candidate{count === 1 ? '' : 's'} (CSV)
      </Button>
    </header>
  )
}

function Kpi({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string | number
  detail?: string
  icon?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
        {icon ?? <Film className="h-4 w-4" />}
        {label}
      </span>
      <span className="font-display text-[26px] font-extrabold leading-none text-ink">{value}</span>
      {detail && <span className="text-[12px] text-muted">{detail}</span>}
    </Card>
  )
}
