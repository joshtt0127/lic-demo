import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Bell, Clapperboard, Film, Home, MessageCircle, Search, User } from 'lucide-react'
import { Logo } from '@/components/ui'
import { PageTransition } from '@/components/PageTransition'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUnreadCounts } from '@/features/notifications/queries'
import { useLiveMessaging } from '@/features/messaging/useLiveMessaging'
import { cn } from '@/lib/cn'

/** Badge counts come from the database (see `useUnreadCounts`). */
function navItems(unread: { messages: number; notifications: number }) {
  return [
    { to: '/talent', label: 'Home', short: 'Home', icon: Home, end: true, badge: 0 },
    {
      to: '/talent/casting-calls',
      label: 'Casting calls',
      short: 'Castings',
      icon: Clapperboard,
      badge: 0,
    },
    { to: '/talent/auditions', label: 'Auditions', short: 'Auditions', icon: Film, badge: 0 },
    {
      to: '/talent/messages',
      label: 'Messages',
      short: 'Inbox',
      icon: MessageCircle,
      badge: unread.messages,
    },
    {
      to: '/talent/notifications',
      label: 'Notifications',
      short: 'Alerts',
      icon: Bell,
      badge: unread.notifications,
    },
    { to: '/talent/profile', label: 'My profile', short: 'Profile', icon: User, badge: 0 },
  ]
}

/**
 * Talent app shell.
 *
 * Desktop: LinkedIn-style top nav. Phone: the nav moves to a bottom tab bar,
 * where a thumb can reach it — the same routes and the same badges, not a
 * second app.
 */
export function TalentLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const unread = useUnreadCounts(profile?.id)
  useLiveMessaging(profile?.id)
  const nav = navItems({
    messages: unread.data?.messages ?? 0,
    notifications: unread.data?.notifications ?? 0,
  })

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-card">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link to="/" className="inline-flex items-center text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link to="/talent" className="-my-1.5 flex shrink-0 items-center py-1.5">
            <Logo size={22} />
          </Link>

          {/* Real search: it queries the published casting calls. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const query = search.trim()
              navigate(query ? `/talent/casting-calls?q=${encodeURIComponent(query)}` : '/talent/casting-calls')
            }}
            className="relative ml-2 hidden h-10 max-w-[220px] flex-1 items-center md:flex"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search castings"
              aria-label="Search casting calls"
              className="h-10 w-full rounded-btn border border-line bg-paper pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted hover:border-ink/20 focus:border-ink/30 focus:bg-card"
            />
          </form>

          {/* On a phone this nav lives at the bottom of the screen instead. */}
          <nav className="no-scrollbar ml-1 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:ml-2 sm:flex sm:gap-1 lg:justify-center">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-btn px-2 py-2 text-[11px] font-medium transition-colors sm:px-3',
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

          <Link
            to="/talent/casting-calls"
            aria-label="Search casting calls"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink sm:hidden"
          >
            <Search className="h-[19px] w-[19px]" />
          </Link>

          <div className="shrink-0 border-l border-line pl-2 sm:pl-3">
            <UserMenu compact profileHref="/talent/profile" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-5 sm:px-6 sm:py-6">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* ── Phone tab bar ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur sm:hidden">
        <ul className="mx-auto flex max-w-[520px] items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          {nav
            .filter((item) => item.to !== '/talent/profile')
            .map(({ to, short, icon: Icon, end, badge }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-btn text-[10px] font-semibold transition-colors',
                      isActive ? 'text-ink' : 'text-muted',
                    )
                  }
                >
                  <span className="relative">
                    <Icon className="h-[21px] w-[21px]" />
                    {!!badge && (
                      <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-signal-no px-1 font-mono text-[9px] font-bold text-white">
                        {badge}
                      </span>
                    )}
                  </span>
                  {short}
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  )
}
