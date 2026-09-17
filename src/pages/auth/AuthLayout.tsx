import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui'
import { asset } from '@/lib/asset'

const POSTERS = [
  '/posters/evermore.png',
  '/posters/rive-droite.png',
  '/posters/les-ombres-de-midi.png',
  '/posters/echo-park.png',
]

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/**
 * Editorial two-column shell for every /auth screen: the product statement and
 * a strip of real posters on the left, the form on the right. Collapses to the
 * form alone under `lg`.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left: statement ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-ink px-12 py-12 lg:flex">
        <Link to="/" className="relative z-10 text-white">
          <Logo size={24} tone="light" />
        </Link>

        <div className="relative z-10 max-w-md">
          <span className="text-label font-semibold uppercase tracking-label text-white/50">
            Casting, end to end
          </span>
          <h2 className="mt-4 text-balance text-3xl font-bold leading-[1.15] tracking-tight text-white">
            The performance layer of global casting
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            One platform for the people who cast and the people who audition. Real projects,
            real submissions, one shared source of truth.
          </p>
        </div>

        <div className="relative z-10">
          <div className="flex gap-3">
            {POSTERS.map((poster, index) => (
              <motion.div
                key={poster}
                initial={animate ? { opacity: 0, y: 14 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * index, duration: 0.4, ease: 'easeOut' }}
                className="h-28 w-20 shrink-0 overflow-hidden rounded-[10px] border border-white/10 bg-white/5"
              >
                <img
                  src={asset(poster)}
                  alt=""
                  className="h-full w-full object-cover opacity-90"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>
          <p className="mt-5 text-xs text-white/40">
            Projects in casting right now on Let It Cast.
          </p>
        </div>
      </aside>

      {/* ── Right: form ── */}
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-14">
        <div className="w-full max-w-[400px]">
          <Link to="/" className="mb-10 inline-flex lg:hidden">
            <Logo size={22} />
          </Link>

          <motion.div
            initial={animate ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}

            <div className="mt-7 flex flex-col gap-4">{children}</div>

            {footer && <div className="mt-7 text-sm text-muted">{footer}</div>}
          </motion.div>
        </div>
      </main>
    </div>
  )
}
