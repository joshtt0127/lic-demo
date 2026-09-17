import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Clapperboard, UserSquare2 } from 'lucide-react'
import { FormError, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import type { AccountType } from '@/types/database'

/**
 * "How are you using Let It Cast?" — the fork between the two experiences.
 * One platform, one sign-up, two onboardings.
 */
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
    <div className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceCard
          icon={<UserSquare2 className="h-5 w-5" />}
          title="I'm a Talent"
          description="Find roles, submit auditions and build your professional profile."
          pending={pending === 'talent'}
          disabled={pending !== null}
          onClick={() => choose('talent')}
        />
        <ChoiceCard
          icon={<Clapperboard className="h-5 w-5" />}
          title="I work in Production"
          description="Discover talent, manage castings and collaborate with your team."
          pending={pending === 'production'}
          disabled={pending !== null}
          onClick={() => choose('production')}
        />
      </div>

      <p className="text-center text-xs text-muted">
        You can only belong to one side of the marketplace per account.
      </p>
    </div>
  )
}

function ChoiceCard({
  icon,
  title,
  description,
  pending,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col items-start gap-4 rounded-card border border-line bg-card p-6 text-left shadow-card transition-shadow',
        disabled ? 'opacity-60' : 'hover:shadow-card-hover',
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-paper text-ink">
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
        {pending ? (
          <>
            <Spinner />
            Setting up…
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </motion.button>
  )
}
