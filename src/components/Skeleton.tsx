import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-btn bg-line/70', className)} />
}

/**
 * Returns `true` for `ms` after mount, then `false` — used to show a brief
 * skeleton state so screens feel "alive" on first paint.
 */
export function useBriefLoading(ms = 600): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}
