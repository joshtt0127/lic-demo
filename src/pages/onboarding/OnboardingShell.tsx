import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/ui'
import { BrandBlobs } from '@/components/brand/BrandBlobs'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { StepProgress } from './StepProgress'
import { VerticalStepper, type StepperItem } from './VerticalStepper'

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/**
 * Onboarding surface, in the two arrangements of the design:
 *
 *  · `split`    — editorial column with the vertical stepper on the left, the
 *                 form panel on the right (steps 1 and 2).
 *  · `centered` — logo + progress in the top bar, everything centered below
 *                 (the skills step, the final step and the account-type fork).
 *
 * Both keep the brand corner and the "PEOPLE / STORIES / ANYWHERE" signature.
 */
export function OnboardingShell({
  variant = 'split',
  eyebrow = 'Talent onboarding',
  title,
  subtitle,
  step,
  totalSteps,
  stepperItems,
  children,
  wide,
  onSkip,
  panel = true,
  progressPlacement,
}: {
  variant?: 'split' | 'centered'
  eyebrow?: string
  title: string
  subtitle?: string
  /** 1-based; omitted on the account-type fork. */
  step?: number
  totalSteps?: number
  stepperItems?: StepperItem[]
  children: ReactNode
  /** Wider content column on the centered variant. */
  wide?: boolean
  /** Shows "Skip for now" in the top bar when the step is skippable. */
  onSkip?: () => void
  /** `false` when the children provide their own surfaces (the account-type cards). */
  panel?: boolean
  /** Where the segmented progress goes. Defaults to the panel on `split`. */
  progressPlacement?: 'header' | 'panel'
}) {
  const progressIn = progressPlacement ?? (variant === 'centered' ? 'header' : 'panel')
  const { signOut } = useAuth()

  const signOutButton = (
    <button
      onClick={() => signOut()}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,#FFFDF8_0%,#F6F5F1_50%,#F3F3F6_100%)]"
      />

      <header className="relative z-20 mx-auto flex w-full max-w-[1340px] items-center gap-4 px-5 py-6 sm:px-8 lg:px-10">
        <Link to="/" aria-label="Let It Cast — home">
          <Logo size={32} />
        </Link>

        {progressIn === 'header' && step && totalSteps && (
          <div
            className={cn(
              'hidden md:block',
              variant === 'centered' ? 'mx-auto' : 'ml-6 mr-auto',
            )}
          >
            <StepProgress total={totalSteps} current={step} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-5">
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-sm font-semibold text-muted transition-colors hover:text-ink"
            >
              Skip for now
            </button>
          )}
          {progressIn === 'header' && step && totalSteps && (
            <>
              <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-muted sm:inline">
                Step {step} / {totalSteps}
              </span>
              <span className="hidden h-5 w-px bg-line sm:block" />
            </>
          )}
          {signOutButton}
        </div>
      </header>

      {variant === 'centered' ? (
        <main className="relative z-10 mx-auto w-full max-w-[1340px] px-5 pb-16 sm:px-8 lg:px-10">
          <motion.div
            initial={animate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={cn('mx-auto', wide ? 'max-w-[960px]' : 'max-w-[820px]')}
          >
            <div className="text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
                {eyebrow}
              </span>
              <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.5rem] lg:text-[2.85rem]">
                {title}
              </h1>
              {subtitle && (
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:text-[16px]">
                  {subtitle}
                </p>
              )}
            </div>

            <div className="mt-10">{children}</div>
          </motion.div>
        </main>
      ) : (
        <main
          className={cn(
            'relative z-10 mx-auto grid w-full max-w-[1340px] items-start gap-8 px-5 pb-16 sm:px-8 lg:gap-12 lg:px-10',
            panel
              ? 'lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.3fr)]'
              : 'lg:min-h-[calc(100vh-14rem)] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.42fr)] lg:items-center',
          )}
        >
          {/* ── Intro column ── */}
          <motion.section
            initial={animate ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={panel ? 'lg:pt-16' : ''}
          >
            <span className="mb-4 block h-[2px] w-9 bg-ink/70" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
              {eyebrow}
            </span>

            <h1 className="mt-4 max-w-[22ch] font-display text-[1.9rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.3rem] lg:max-w-[12ch] lg:text-[2.6rem] xl:text-[3.1rem]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted sm:text-[16px] lg:max-w-sm">
                {subtitle}
              </p>
            )}

            {stepperItems && step && (
              <div className="mt-10 max-w-xs">
                <VerticalStepper items={stepperItems} current={step} />
              </div>
            )}

            <div className="mt-14 hidden lg:block">
              <span className="mb-3 block h-[2px] w-7 bg-ink/40" />
              <span className="block text-[11px] font-semibold uppercase leading-[1.9] tracking-[0.28em] text-muted">
                People
                <br />
                Stories
                <br />
                Anywhere
              </span>
            </div>
          </motion.section>

          {/* ── Form panel ── */}
          <motion.section
            initial={animate ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
            className="w-full"
          >
            {panel ? (
              <div className="rounded-panel border border-white/70 bg-[#FBFAF7]/90 px-5 py-7 shadow-panel backdrop-blur-sm sm:px-8 sm:py-9 lg:px-10">
                {progressIn === 'panel' && step && totalSteps && (
                  <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                      Step {step} of {totalSteps}
                    </span>
                    <StepProgress total={totalSteps} current={step} />
                  </div>
                )}
                {children}
              </div>
            ) : (
              children
            )}
          </motion.section>
        </main>
      )}

      <BrandBlobs corner={variant === 'centered' ? 'bottom-right' : 'bottom-left'} />
    </div>
  )
}
