import { Link } from 'react-router-dom'
import { CheckCircle2, Send, Sparkles, XCircle } from 'lucide-react'
import { Card, Tag } from '@/components/ui'
import type { MyApplication } from '@/features/applications/queries'
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE, relativeTime } from '@/lib/format'
import { asset } from '@/lib/asset'

/**
 * Your own activity in the feed: an application you sent, or a decision a
 * production took on it. Both are read from the `applications` row itself.
 */
export function ActivityPost({
  application,
  at,
  event,
}: {
  application: MyApplication
  at: string
  event: 'applied' | 'decision'
}) {
  const icon =
    event === 'applied' ? (
      <Send className="h-4 w-4" />
    ) : application.status === 'not_selected' ? (
      <XCircle className="h-4 w-4" />
    ) : application.status === 'cast' ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : (
      <Sparkles className="h-4 w-4" />
    )

  const headline =
    event === 'applied'
      ? 'You applied'
      : application.status === 'not_selected'
        ? 'A production closed your audition'
        : application.status === 'cast'
          ? 'You are cast'
          : 'Your audition moved forward'

  return (
    <Card flush className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px] font-semibold text-muted sm:px-5">
        <span className="text-ink/70">{icon}</span>
        <span className="min-w-0 truncate">{headline}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0 font-normal">{relativeTime(at)}</span>
      </div>

      <Link to="/talent/auditions" className="flex items-center gap-4 px-4 py-4 sm:px-5">
        <span className="h-16 w-12 shrink-0 overflow-hidden rounded-btn bg-line">
          {application.project?.poster_url && (
            <img
              src={asset(application.project.poster_url)}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-bold text-ink">
            {application.role?.name ?? 'Role'}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {application.project?.title ?? application.casting?.title ?? 'Project'}
            {application.hasSelfTape ? ' · self-tape sent' : ''}
          </span>
        </span>
        <Tag tone={APPLICATION_STATUS_TONE[application.status]}>
          {APPLICATION_STATUS_LABEL[application.status]}
        </Tag>
      </Link>
    </Card>
  )
}
