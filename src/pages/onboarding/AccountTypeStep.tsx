import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Clapperboard } from 'lucide-react'
import { FormError, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import type { AccountType } from '@/types/database'

/**
 * "How are you using Let It Cast?" — the fork between the two experiences.
 * One platform, one sign-up, two onboardings.
 */

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

const CHOICES: {
  id: AccountType
  title: string
  description: string
  tags: string[]
  watermark: 'talent' | 'production'
}[] = [
  {
    id: 'talent',
    title: 'I’m a Talent',
    description: 'Find roles, submit auditions and build your professional profile.',
    tags: ['Auditions', 'Roles', 'Visibility'],
    watermark: 'talent',
  },
  {
    id: 'production',
    title: 'I work in Production',
    description: 'Discover talent, manage castings and collaborate with your team.',
    tags: ['Find talent', 'Post castings', 'Collaborate'],
    watermark: 'production',
  },
]

export function AccountTypeStep() {
  const { setAccountType } = useAuth()
  const [pending, setPending] = useState<AccountType | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(accountType: AccountType) {
    setError(null)
    setPending(accountType)
    const result = await setAccountType(accountType)
    if (result.error) {
      setPending(null)
      setError(result.error)
      return
    }
    track('account_type_selected', { account_type: accountType })
    // The profile refresh moves the onboarding to its next step.
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <FormError>{error}</FormError>}

      <div className="grid gap-5 md:grid-cols-2">
        {CHOICES.map((choice, index) => (
          <ChoiceCard
            key={choice.id}
            {...choice}
            index={index}
            pending={pending === choice.id}
            disabled={pending !== null}
            onClick={() => choose(choice.id)}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <span className="h-[2px] w-7 bg-ink/25" />
        <p className="text-center text-[13px] text-muted">
          You can only belong to one side of the marketplace per account.
        </p>
      </div>
    </div>
  )
}

function ChoiceCard({
  title,
  description,
  tags,
  watermark,
  index,
  pending,
  disabled,
  onClick,
}: {
  title: string
  description: string
  tags: string[]
  watermark: 'talent' | 'production'
  index: number
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      aria-label={`Continue — ${title}`}
      initial={animate ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4, ease: 'easeOut' }}
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.995 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex min-h-[300px] flex-col overflow-hidden rounded-panel border border-white/70 bg-[#FBFAF7]/90 p-6 text-left shadow-panel backdrop-blur-sm transition-shadow sm:min-h-[420px] sm:p-8',
        disabled ? 'opacity-70' : 'hover:shadow-card-hover',
      )}
    >
      <Watermark kind={watermark} />

      <span className="relative flex h-12 w-12 items-center justify-center rounded-field bg-[#F1F0EB] text-ink sm:h-14 sm:w-14">
        {watermark === 'talent' ? (
          <TalentGlyph className="h-6 w-6" />
        ) : (
          <Clapperboard className="h-6 w-6" />
        )}
      </span>

      <h2 className="relative mt-6 font-display text-[1.45rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.65rem]">
        {title}
      </h2>
      <p className="relative mt-3 max-w-[22rem] text-[15px] leading-relaxed text-muted sm:text-[17px]">
        {description}
      </p>

      <ul className="relative mt-5 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li
            key={tag}
            className="whitespace-nowrap rounded-full bg-[#F1F0EB] px-3 py-1.5 text-[13px] font-medium text-ink"
          >
            {tag}
          </li>
        ))}
      </ul>

      <span
        className={cn(
          'relative mt-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card/70 text-ink transition-colors sm:h-13 sm:w-13',
          !disabled && 'group-hover:border-ink group-hover:bg-ink group-hover:text-white',
        )}
      >
        {pending ? <Spinner className="h-[18px] w-[18px]" /> : <ArrowRight className="h-5 w-5" />}
      </span>
    </motion.button>
  )
}

/** Simple avatar-style glyph (circle + shoulders), as drawn in the design. */
function TalentGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor">
      <circle cx="12" cy="8" r="3.4" strokeWidth="1.7" />
      <path d="M4.6 20.5c.9-3.8 3.9-6 7.4-6s6.5 2.2 7.4 6" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** Oversized, very faint illustration in the bottom-right corner of each card. */
function Watermark({ kind }: { kind: 'talent' | 'production' }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-10 -right-10 text-ink/[0.035] sm:-bottom-12 sm:-right-12"
    >
      {kind === 'talent' ? (
        <svg viewBox="0 0 24 24" className="h-44 w-44 sm:h-52 sm:w-52" fill="currentColor">
          <circle cx="12" cy="8" r="4.2" />
          <path d="M3.6 22c.7-4.6 4.1-7.2 8.4-7.2s7.7 2.6 8.4 7.2z" />
        </svg>
      ) : (
        <Clapperboard className="h-40 w-40 -rotate-12 sm:h-48 sm:w-48" strokeWidth={1} />
      )}
    </span>
  )
}
