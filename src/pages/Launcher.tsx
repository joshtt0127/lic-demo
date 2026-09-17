import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Monitor, Play, Smartphone, UserSquare2 } from 'lucide-react'
import { Button, Logo } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { displayName, homeRouteFor } from '@/lib/access'

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/**
 * Public landing. Signed out it sells the product and routes to auth; signed in
 * it offers a single "continue" into the user's own space.
 *
 * The three surface cards stay: they navigate for real, and the route guards
 * decide whether the visitor needs to sign in first.
 */
export function Launcher() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={animate ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-3xl"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size={40} />
          <span className="tech-label mt-8">Casting, end to end</span>
          <h1 className="mt-3 max-w-xl text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            The performance layer of global casting
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            One platform for the people who cast and the people who audition — real projects,
            real submissions, one shared source of truth.
          </p>

          {session ? (
            <div className="mt-7 flex flex-col items-center gap-2">
              <Button size="lg" onClick={() => navigate(homeRouteFor(profile))} iconRight={<ArrowRight className="h-4 w-4" />}>
                Continue as {displayName(profile)}
              </Button>
            </div>
          ) : (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => navigate('/auth/sign-up')}>
                Create your account
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate('/auth/sign-in')}>
                Sign in
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <EntryCard
            icon={<Monitor className="h-5 w-5" />}
            tag="Web · desktop"
            title="Production side"
            desc="Dashboard, talent search, self-tape review & casting console."
            onClick={() => navigate('/studio')}
          />
          <EntryCard
            icon={<UserSquare2 className="h-5 w-5" />}
            tag="Web · desktop"
            title="Talent space"
            desc="Casting calls, auditions, messages, notifications & professional profile."
            onClick={() => navigate('/talent')}
          />
          <EntryCard
            icon={<Smartphone className="h-5 w-5" />}
            tag="Mobile · app"
            title="Talent mobile app"
            desc="Casting calls, self-tape recording, auditions & feed."
            onClick={() => navigate('/app')}
          />
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/pitch"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-btn px-3 text-sm font-semibold text-link transition-colors hover:bg-link/5"
          >
            <Play className="h-4 w-4" />
            View pitch
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

function EntryCard({
  icon,
  tag,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  tag: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="group flex flex-col items-start gap-4 rounded-card border border-line bg-card p-6 text-left shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-paper text-ink">
        {icon}
      </span>
      <div>
        <span className="tech-label">{tag}</span>
        <h2 className="mt-1.5 text-lg font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-ink">
        Open
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </motion.button>
  )
}
