import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  Clapperboard,
  FolderOpen,
  Home,
  Inbox,
  Plus,
  Search,
  Settings,
  UserRound,
  Users,
} from 'lucide-react'
import { Logo } from '@/components/ui'
import { PageTransition } from '@/components/PageTransition'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useUnreadCounts } from '@/features/notifications/queries'
import { ORG_ROLE_LABEL } from '@/lib/access'
import { cn } from '@/lib/cn'

/**
 * Production shell — the sidebar layout of the studio design: navigation on the
 * left, search and account on top, content on the right.
 *
 * Every badge and every label here reads from the database (unread counts, the
 * organization you belong to, your role in it).
 */
export function StudioLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const unread = useUnreadCounts(profile?.id)
  const [search, setSearch] = useState('')

  const nav = [
    { to: '/studio', label: 'Home', icon: Home, end: true, badge: 0 },
    { to: '/studio/casting-calls', label: 'Casting calls', icon: Clapperboard, badge: 0 },
    { to: '/studio/projects', label: 'Projects', icon: FolderOpen, badge: 0 },
    { to: '/studio/talent', label: 'Talent Recruiter', icon: UserRound, badge: 0 },
    {
      to: '/studio/messages',
      label: 'Inbox',
      icon: Inbox,
      badge: (unread.data?.messages ?? 0) + (unread.data?.notifications ?? 0),
    },
    { to: '/studio/calendar', label: 'Calendar', icon: CalendarDays, badge: 0 },
    { to: '/studio/team', label: 'Team', icon: Users, badge: 0 },
    { to: '/studio/settings', label: 'Settings', icon: Settings, badge: 0 },
  ]

  const meta = [
    organization?.name,
    organization ? ORG_ROLE_LABEL[organization.role] : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ── Sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col justify-between border-r border-line bg-[#FBFAF7] px-5 py-7 lg:flex">
        <div>
          <Link to="/studio" aria-label="Let It Cast — studio home" className="block px-2">
            <Logo size={30} />
          </Link>

          <nav className="mt-9 flex flex-col gap-1">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-field px-3 py-2.5 text-[15px] font-semibold transition-colors',
                    isActive
                      ? 'bg-card text-ink shadow-card'
                      : 'text-muted hover:bg-card/60 hover:text-ink',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-signal-no px-1.5 font-mono text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Brand card, as in the design */}
        <div className="relative h-[168px] overflow-hidden rounded-panel border border-line bg-card px-4 py-5">
          <span className="relative z-10 block font-display text-[15px] font-bold leading-[1.35] text-ink">
            People
            <br />
            Stories
            <br />
            Anywhere
          </span>
          <span aria-hidden className="pointer-events-none">
            <span className="absolute bottom-4 left-3 h-[74px] w-[74px] rotate-[-14deg] rounded-[1.4rem] bg-gradient-to-br from-[#FFD447] to-[#F6B63C] shadow-[0_14px_30px_-14px_rgba(246,182,60,0.8)]" />
            <span className="absolute bottom-[42px] left-[62px] h-9 w-9 rotate-[14deg] rounded-[0.8rem] bg-gradient-to-br from-[#FF6B60] to-[#E0483D] shadow-[0_14px_30px_-16px_rgba(224,72,61,0.8)]" />
            <span className="absolute bottom-2 left-[78px] h-[74px] w-[74px] rotate-[9deg] rounded-[1.4rem] bg-gradient-to-br from-[#5B8DEF] to-[#2563EB] shadow-[0_16px_34px_-16px_rgba(37,99,235,0.8)]" />
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex h-[88px] items-center gap-3 px-4 sm:gap-5 sm:px-8">
            <Link to="/studio" className="lg:hidden" aria-label="Studio home">
              <Logo size={26} markOnly />
            </Link>

            {/* On a phone the field would be a slit; the icon goes to the
                search page instead. */}
            <Link
              to="/studio/talent"
              aria-label="Search talent"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field border border-line bg-card text-muted sm:hidden"
            >
              <Search className="h-[18px] w-[18px]" />
            </Link>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                const query = search.trim()
                navigate(query ? `/studio/talent?q=${encodeURIComponent(query)}` : '/studio/talent')
              }}
              className="relative mx-auto hidden h-12 w-full min-w-0 max-w-[840px] items-center sm:flex"
            >
              <Search className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search for talent, project, role…"
                aria-label="Search talent"
                className="h-12 w-full rounded-field border border-line bg-card pl-12 pr-16 text-[15px] text-ink outline-none transition-colors placeholder:text-muted hover:border-ink/20 focus:border-ink/30"
              />
              <kbd className="pointer-events-none absolute right-3 hidden rounded-md border border-line bg-paper px-1.5 py-1 font-mono text-[10px] text-muted sm:block">
                ⌘K
              </kbd>
            </form>

            <Link
              to="/studio/notifications"
              aria-label="Notifications"
              className="relative ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <Bell className="h-[19px] w-[19px]" />
              {(unread.data?.notifications ?? 0) > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-signal-no ring-2 ring-paper" />
              )}
            </Link>

            <div className="shrink-0">
              <UserMenu meta={meta || 'Production'} profileHref="/studio/settings" />
            </div>
          </div>

          {/* Mobile navigation — the sidebar is desktop-only. */}
          <nav className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-t border-line px-4 py-2.5 lg:hidden">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                    isActive ? 'bg-ink text-white' : 'text-muted',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-no px-1 font-mono text-[9px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-8 sm:pt-6">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

/** Shared "New casting" call to action — used by the home and the casting list. */
export function NewCastingButton({ className }: { className?: string }) {
  return (
    <Link
      to="/studio/casting-calls/new"
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-field bg-ink px-6 text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99]',
        className,
      )}
    >
      <Plus className="h-[18px] w-[18px]" />
      New casting
    </Link>
  )
}
