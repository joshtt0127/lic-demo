import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/**
 * Shared frame for every onboarding step: logo, step counter, sign-out escape
 * hatch. Sober and centered — the content does the talking.
 */
export function OnboardingShell({
  step,
  totalSteps,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  step?: number
  totalSteps?: number
  eyebrow?: string
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Wider column for multi-card steps. */
  wide?: boolean
}) {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-6 py-6">
        <Logo size={22} />
        <div className="flex items-center gap-4">
          {step && totalSteps && (
            <span className="tech-label">
              Step {step} / {totalSteps}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      {step && totalSteps && (
        <div className="h-[3px] w-full bg-line">
          <motion.div
            className="h-full bg-ink"
            initial={animate ? { width: 0 } : false}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-6 py-12 sm:py-16">
        <motion.div
          initial={animate ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={wide ? 'w-full max-w-3xl' : 'w-full max-w-xl'}
        >
          <div className="text-center">
            {eyebrow && <span className="tech-label">{eyebrow}</span>}
            <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{subtitle}</p>
            )}
          </div>

          <div className="mt-9">{children}</div>

          {footer && <div className="mt-8">{footer}</div>}
        </motion.div>
      </main>
    </div>
  )
}
