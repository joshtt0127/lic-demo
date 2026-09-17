import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Logo } from './Logo'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />
}

/** Whole-screen state while the session is being restored. */
export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper">
      <Logo size={28} />
      <span className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {label}
      </span>
    </div>
  )
}
