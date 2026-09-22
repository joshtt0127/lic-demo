import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Card, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { updateProfile } from '@/data/repositories/profiles'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * "Email me when something happens."
 *
 * The switch writes `profiles.email_notifications`, which the database trigger
 * reads before enqueuing anything — the opt-out is honoured at the source, not
 * by the sender.
 */
export function EmailPreference() {
  const t = useT()
  const toast = useToast()
  const { profile, refreshProfile } = useAuth()
  const [pending, setPending] = useState(false)

  const enabled = profile?.email_notifications ?? true

  async function toggle() {
    if (!profile) return
    setPending(true)
    try {
      await updateProfile(profile.id, { email_notifications: !enabled })
      await refreshProfile()
      toast(enabled ? t('notifications.emailOff') : t('notifications.emailOn'))
    } catch (error) {
      toast(errorMessage(error, t('notifications.emailFailed')))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <Mail className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">
            {t('notifications.emailTitle')}
          </span>
          <span className="block text-[12.5px] text-muted">{t('notifications.emailHint')}</span>
        </span>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('notifications.emailTitle')}
        disabled={pending}
        onClick={toggle}
        className={cn(
          'relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
          enabled ? 'bg-ink' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )}
        >
          {pending && <Spinner className="h-3 w-3" />}
        </span>
      </button>
    </Card>
  )
}
