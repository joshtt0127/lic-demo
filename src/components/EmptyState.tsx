import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The one empty state used across the app: an icon, what is missing, and the
 * action that fixes it. Never a blank area.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-field bg-paper text-center',
        compact ? 'px-5 py-7' : 'px-6 py-10',
        className,
      )}
    >
      {icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted shadow-card">
          {icon}
        </span>
      )}
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[14px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
