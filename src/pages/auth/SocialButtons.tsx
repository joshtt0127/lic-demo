import { useState } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'

/**
 * Apple / Google / LinkedIn.
 *
 * These really start Supabase's OAuth flow. Until the OAuth apps are configured
 * on the project, Supabase answers "provider is not enabled" and we surface that
 * sentence instead of pretending — the architecture is ready, the credentials
 * are not (see docs/FULLSTACK_MIGRATION_PLAN.md §4).
 */

const PROVIDERS: { id: Provider; label: string; icon: JSX.Element }[] = [
  {
    id: 'apple',
    label: 'Continue with Apple',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
  {
    id: 'google',
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.2h6.5c-.1 1-.8 2.6-2.4 3.7l-.02.15 3.5 2.7.24.02c2.2-2.05 3.48-5.05 3.48-8.57z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 5.9-1.05 7.8-2.86l-3.72-2.87c-1 .7-2.33 1.18-4.08 1.18-3.1 0-5.74-2.05-6.68-4.88l-.14.01-3.6 2.8-.05.13C3.44 21.3 7.4 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.32 14.57A7.4 7.4 0 0 1 4.92 12c0-.9.16-1.77.38-2.57l-.006-.17-3.65-2.84-.12.06A11.98 11.98 0 0 0 0 12c0 1.94.47 3.77 1.52 5.52l3.8-2.95z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c2.2 0 3.68.95 4.53 1.75l3.3-3.23C17.88 1.33 15.2 0 12 0 7.4 0 3.44 2.7 1.52 6.48l3.79 2.95C6.26 6.6 8.9 4.75 12 4.75z"
        />
      </svg>
    ),
  },
  {
    id: 'linkedin_oidc',
    label: 'Continue with LinkedIn',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden fill="#0A66C2">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05a3.75 3.75 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
      </svg>
    ),
  },
]

export function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const { signInWithProvider } = useAuth()
  const [pending, setPending] = useState<Provider | null>(null)

  async function start(provider: Provider) {
    onError('')
    setPending(provider)
    const { error } = await signInWithProvider(provider)
    setPending(null)
    if (error) onError(error)
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => start(provider.id)}
          disabled={pending !== null}
          className="inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-field border border-line bg-card px-1.5 text-[10.5px] font-semibold leading-none tracking-[-0.01em] text-ink transition-colors hover:border-ink/25 hover:bg-paper disabled:opacity-60"
        >
          {pending === provider.id ? <Spinner /> : provider.icon}
          <span className="truncate">{provider.label}</span>
        </button>
      ))}
    </div>
  )
}
