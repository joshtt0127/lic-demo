import { Link } from 'react-router-dom'
import { Bell, Clapperboard, Film, MessageCircle, Zap } from 'lucide-react'
import { Button, FormError } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import { useNotificationMutations, useNotifications } from '@/features/notifications/queries'
import { useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Notifications, written by database triggers — a row here means an event
 * really happened (application received, status decided, message sent).
 */

const ICONS: Record<string, typeof Bell> = {
  new_application: Clapperboard,
  application_status: Film,
  message: MessageCircle,
}

const TONES: Record<string, string> = {
  new_application: 'bg-link/10 text-link',
  application_status: 'bg-signal-good-bg text-signal-good',
  message: 'bg-gold/15 text-[#8A6D00]',
}

/** Where a notification leads, based on what it is about. */
function destination(type: string, entityType: string | null, base: string): string {
  if (type === 'message' || entityType === 'conversation') return `${base}/messages`
  if (type === 'application_status' || entityType === 'application') {
    return base === '/talent' ? '/talent/auditions' : '/studio/casting-calls'
  }
  return `${base}/casting-calls`
}

export function NotificationsScreen({ base }: { base: '/talent' | '/studio' }) {
  const t = useT()
  const { profile } = useAuth()
  const profileId = profile?.id
  const notifications = useNotifications(profileId)
  const { markRead, markAllRead } = useNotificationMutations(profileId)

  const items = notifications.data ?? []
  const unread = items.filter((item) => !item.read_at).length

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
            {t('notifications.title')}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {notifications.isLoading
              ? 'Loading…'
              : unread > 0
                ? `${unread} unread`
                : 'You are all caught up'}
          </p>
        </div>
        {unread > 0 && (
          <Button
            size="sm"
            variant="secondary"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t('notifications.markAll')}
          </Button>
        )}
      </header>

      {notifications.error && (
        <FormError>{errorMessage(notifications.error, 'Could not load your notifications')}</FormError>
      )}

      {notifications.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-5 w-5" />}
          title={t('notifications.empty')}
          description="You will be told here when a production views your audition, changes its status or messages you."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const Icon = ICONS[item.type] ?? Bell
            return (
              <Link
                key={item.id}
                to={destination(item.type, item.entity_type, base)}
                onClick={() => !item.read_at && markRead.mutate(item.id)}
                className={cn(
                  'flex items-start gap-3 rounded-card border bg-card p-4 shadow-card transition-colors hover:border-ink/20',
                  item.read_at ? 'border-line' : 'border-link/30 bg-link/[0.03]',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    TONES[item.type] ?? 'bg-paper text-muted ring-1 ring-line',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-ink">{item.title}</p>
                  {item.body && <p className="text-[14px] text-muted">{item.body}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[12px] text-muted">{relativeTime(item.created_at, t)}</span>
                  {!item.read_at && <span className="h-2 w-2 rounded-full bg-link" />}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
