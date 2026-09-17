import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Bell, Clapperboard, Film, Home, MessageCircle, Search, User } from 'lucide-react'
import { Logo } from '@/components/ui'
import { PageTransition } from '@/components/PageTransition'
import { UserMenu } from '@/components/UserMenu'
import { useToast } from '@/components/Toast'
import { unreadMessagesCount, unreadNotificationsCount } from '@/data'
import { cn } from '@/lib/cn'

const nav = [
  { to: '/talent', label: 'Home', icon: Home, end: true },
  { to: '/talent/casting-calls', label: 'Casting calls', icon: Clapperboard },
  { to: '/talent/auditions', label: 'Auditions', icon: Film },
  { to: '/talent/messages', label: 'Messages', icon: MessageCircle, badge: unreadMessagesCount },
  { to: '/talent/notifications', label: 'Notifications', icon: Bell, badge: unreadNotificationsCount },
  { to: '/talent/profile', label: 'My profile', icon: User },
]

/** Talent desktop app shell — LinkedIn-style top nav, full-width content. */
export function TalentDesktopLayout() {
  const location = useLocation()
  const toast = useToast()

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-6">
          <Link to="/" className="inline-flex items-center text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link to="/talent" className="shrink-0">
            <Logo size={22} />
          </Link>

          <button
            onClick={() => toast('Search — coming soon')}
            className="relative ml-2 hidden h-10 max-w-[220px] flex-1 items-center gap-2 rounded-btn border border-line bg-paper pl-9 pr-3 text-left text-sm text-muted transition-colors hover:border-ink/20 md:flex"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            Search
          </button>

          <nav className="ml-2 flex flex-1 items-center justify-center gap-1">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-0.5 rounded-btn px-3 py-1.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    <span className="relative">
                      <Icon className="h-[19px] w-[19px]" />
                      {!!badge && (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-signal-no px-1 font-mono text-[9px] font-bold text-white">
                          {badge}
                        </span>
                      )}
                    </span>
                    <span className="hidden sm:block">{label}</span>
                    {isActive && <span className="absolute -bottom-[15px] h-[2px] w-full bg-ink" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="shrink-0 border-l border-line pl-3">
            <UserMenu compact profileHref="/talent/profile" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-6">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  )
}
