import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Search, Bell, ChevronDown } from 'lucide-react'
import { Logo } from '@/components/ui'
import { CommandPalette, openCommandPalette } from '@/components/CommandPalette'
import { PageTransition } from '@/components/PageTransition'
import { UserMenu } from '@/components/UserMenu'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'

const menu = [
  { to: '/studio', label: 'Home', end: true },
  { to: '/studio/dashboard', label: 'Casting calls' },
  { to: '/studio/search', label: 'Actors' },
]

/** Production app shell — persistent desktop top nav + full-width content. */
export function StudioLayout() {
  const location = useLocation()
  const toast = useToast()
  const { profile } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <CommandPalette />

      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-6 px-6">
          <Link to="/" className="shrink-0">
            <Logo size={24} />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {menu.map(({ to, label, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'rounded-btn px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
            <button
              onClick={() => toast('Help center coming soon')}
              className="rounded-btn px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              Help
            </button>
          </nav>

          {/* Global search → opens command palette */}
          <button
            onClick={openCommandPalette}
            className="relative ml-auto hidden h-10 max-w-md flex-1 items-center gap-2 rounded-btn border border-line bg-card pl-9 pr-3 text-left text-sm text-muted transition-colors hover:border-ink/20 md:flex"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            Search talent, project, role…
            <kbd className="ml-auto rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-muted">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <button
              onClick={() => toast('Langue : Français bientôt disponible')}
              className="hidden items-center gap-1 rounded-btn px-2 py-1.5 text-sm font-medium text-muted hover:text-ink sm:flex"
            >
              EN <span className="text-muted/70">(FR)</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => toast('Vous êtes à jour — aucune notification')}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-signal-no ring-2 ring-paper" />
            </button>

            <div className="border-l border-line pl-3">
              <UserMenu
                meta={[profile?.city, profile?.country].filter(Boolean).join(', ') || 'Production'}
                profileHref="/studio/search"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-6">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  )
}
