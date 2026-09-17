import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LogOut, User } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { displayName } from '@/lib/access'
import { cn } from '@/lib/cn'

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/**
 * Signed-in user control in the app shells: identity, profile link, sign out.
 * Replaces the demo password gate — this is the only way out of the app.
 */
export function UserMenu({
  meta,
  profileHref,
  compact,
}: {
  /** Secondary line, e.g. "Casting director · A24". */
  meta?: string
  profileHref: string
  /** Hide the name column (tight headers). */
  compact?: boolean
}) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const name = displayName(profile)

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2.5 rounded-btn py-1 pl-1 pr-2 text-left transition-colors hover:bg-ink/5',
        )}
      >
        <Avatar src={profile?.avatar_url ?? undefined} name={name} size="sm" />
        {!compact && (
          <span className="hidden leading-tight lg:block">
            <span className="block text-sm font-semibold text-ink">{name}</span>
            {meta && <span className="block text-xs text-muted">{meta}</span>}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={animate ? { opacity: 0, y: -6, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-card border border-line bg-card shadow-card-hover"
          >
            <div className="border-b border-line px-4 py-3">
              <div className="text-sm font-semibold text-ink">{name}</div>
              <div className="truncate text-xs text-muted">{profile?.id ? meta : ''}</div>
            </div>

            <Link
              to={profileHref}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              <User className="h-4 w-4 text-muted" />
              My profile
            </Link>

            <button
              onClick={handleSignOut}
              role="menuitem"
              className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              <LogOut className="h-4 w-4 text-muted" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
