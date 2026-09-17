import { forwardRef, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Form primitives.
 *
 * Two field sizes on purpose: `md` is the dense in-app field (edit modals,
 * filters), `lg` is the auth / onboarding field from the design — taller, white,
 * softer corners. Labels come in two flavours too: the app's uppercase
 * `tech-label`, and the plain sentence-case label with an "Optional" suffix used
 * across the onboarding.
 */

export type FieldSize = 'md' | 'lg'

const fieldBase =
  'w-full border bg-card text-ink outline-none transition-colors ' +
  'placeholder:text-muted/60 disabled:opacity-60'

const fieldSizes: Record<FieldSize, string> = {
  md: 'h-11 rounded-btn px-3 text-sm',
  lg: 'h-[52px] rounded-field px-4 text-[15px]',
}

export function fieldClasses(size: FieldSize, invalid?: boolean, hasIcon?: boolean): string {
  return cn(
    fieldBase,
    fieldSizes[size],
    hasIcon && (size === 'lg' ? 'pl-11' : 'pl-9'),
    invalid
      ? 'border-signal-no focus:border-signal-no'
      : 'border-line hover:border-ink/20 focus:border-ink/40',
  )
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  /** Optional leading icon. */
  icon?: ReactNode
  fieldSize?: FieldSize
  /** Trailing adornment, e.g. a unit ("cm"). */
  suffix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, suffix, fieldSize = 'md', ...props },
  ref,
) {
  return (
    <span className="relative block">
      {icon && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted',
            fieldSize === 'lg' ? 'left-4' : 'left-3',
          )}
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldClasses(fieldSize, invalid, Boolean(icon)),
          suffix ? 'pr-12' : undefined,
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
          {suffix}
        </span>
      )}
    </span>
  )
})

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
  fieldSize?: FieldSize
}

/** Native select with the same geometry as `Input` (and a real chevron). */
export const SelectInput = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectInput(
  { className, invalid, fieldSize = 'md', children, ...props },
  ref,
) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldClasses(fieldSize, invalid),
          'appearance-none pr-10',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <path
          d="M6 8l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, fieldSize = 'md', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        fieldSize={fieldSize}
        className={cn('pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className={cn(
          'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink',
          fieldSize === 'lg' ? 'right-2' : 'right-1',
        )}
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
  plainLabel,
  icon,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string
  optional?: boolean
  /** Sentence-case label (auth / onboarding) instead of the app's tech label. */
  plainLabel?: boolean
  /** Leading icon shown next to a plain label. */
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="flex items-center gap-2">
        {icon && <span className="text-muted">{icon}</span>}
        <span
          className={cn(
            plainLabel
              ? 'text-[15px] font-semibold text-ink'
              : 'text-label font-semibold uppercase tracking-label text-muted',
          )}
        >
          {label}
        </span>
        {optional && <span className="text-[13px] font-normal text-muted">Optional</span>}
      </label>
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1 text-xs font-medium text-signal-no">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="text-[13px] text-muted">{hint}</span>
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
  plainLabel,
  ...props
}: InputProps & {
  label: string
  error?: string | null
  hint?: string
  optional?: boolean
  plainLabel?: boolean
}) {
  const id = useId()
  return (
    <FormField
      label={label}
      htmlFor={id}
      error={error}
      hint={hint}
      optional={optional}
      plainLabel={plainLabel}
    >
      <Input id={id} invalid={Boolean(error)} {...props} />
    </FormField>
  )
}

export function PasswordField({
  label,
  error,
  hint,
  plainLabel,
  ...props
}: InputProps & { label: string; error?: string | null; hint?: string; plainLabel?: boolean }) {
  const id = useId()
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} plainLabel={plainLabel}>
      <PasswordInput id={id} invalid={Boolean(error)} {...props} />
    </FormField>
  )
}

/** Square checkbox with the brand's ink fill. */
export function Checkbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  id?: string
}) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative inline-flex h-5 w-5 shrink-0">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-[7px] border border-line bg-card transition-colors checked:border-ink checked:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
        />
        <Check className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 text-white opacity-0 peer-checked:opacity-100" />
      </span>
      <label htmlFor={inputId} className="cursor-pointer text-sm text-ink">
        {label}
      </label>
    </span>
  )
}

/** Form-level error banner (wrong credentials, network failure…). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-field border border-signal-no/30 bg-signal-no/5 px-3.5 py-3 text-sm"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-signal-no" />
      <span className="text-ink/80">{children}</span>
    </div>
  )
}
