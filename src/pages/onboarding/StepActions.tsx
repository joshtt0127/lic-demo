import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'

/**
 * Footer of every onboarding step. "Skip for now" only appears where the data
 * is genuinely optional — required steps don't pretend to be skippable.
 */
export function StepActions({
  onBack,
  onSkip,
  onContinue,
  continueLabel = 'Continue',
  pending,
  disabled,
}: {
  onBack?: () => void
  onSkip?: () => void
  onContinue: () => void
  continueLabel?: string
  pending?: boolean
  disabled?: boolean
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <div>
        {onBack && (
          <Button variant="ghost" onClick={onBack} disabled={pending} icon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={pending}>
            Skip for now
          </Button>
        )}
        <Button
          size="lg"
          onClick={onContinue}
          disabled={pending || disabled}
          iconRight={!pending ? <ArrowRight className="h-4 w-4" /> : undefined}
        >
          {pending && <Spinner />}
          {continueLabel}
        </Button>
      </div>
    </div>
  )
}
