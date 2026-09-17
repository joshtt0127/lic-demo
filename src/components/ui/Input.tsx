import { forwardRef, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Form primitives in the Let It Cast DA — same paper/ink/line palette and
 * `rounded-btn` geometry as `EditModal`'s inline inputs, plus the label /
 * error / hint scaffolding real forms need (auth, onboarding, project forms).
 */

const fieldBase =
  'w-full rounded-btn border bg-paper px-3 text-sm text-ink outline-none transition-colors ' +
  'placeholder:text-muted/60 focus:bg-card disabled:opacity-60'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  /** Optional leading icon. */
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, ...props },
  ref,
) {
  return (
    <span className="relative block">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          'h-11',
          icon ? 'pl-9' : undefined,
          invalid ? 'border-signal-no focus:border-signal-no' : 'border-line focus:border-ink/30',
          className,
        )}
        {...props}
      />
    </span>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  )
})

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2">
        <span className="text-label font-semibold uppercase tracking-label text-muted">{label}</span>
        {optional && <span className="text-[11px] font-normal normal-case text-muted/70">Optional</span>}
      </label>
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1 text-xs font-medium text-signal-no">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </div>
  )
}

/** Labelled field that wires the id for you. */
export function TextField({
  label,
  error,
  hint,
  optional,
  ...props
}: InputProps & { label: string; error?: string | null; hint?: string; optional?: boolean }) {
  const id = useId()
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} optional={optional}>
      <Input id={id} invalid={Boolean(error)} {...props} />
    </FormField>
  )
}

export function PasswordField({
  label,
  error,
  hint,
  ...props
}: InputProps & { label: string; error?: string | null; hint?: string }) {
  const id = useId()
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <PasswordInput id={id} invalid={Boolean(error)} {...props} />
    </FormField>
  )
}

/** Form-level error banner (wrong credentials, network failure…). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-btn border border-signal-no/30 bg-signal-no/5 px-3 py-2.5 text-sm text-signal-no"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="text-ink/80">{children}</span>
    </div>
  )
}
