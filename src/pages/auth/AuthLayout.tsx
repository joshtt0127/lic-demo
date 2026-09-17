import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Star, Users, Zap } from 'lucide-react'
import { Logo } from '@/components/ui'
import { BrandBlobs, FloatingSquares } from '@/components/brand/BrandBlobs'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'

const animate = typeof document === 'undefined' || document.visibilityState === 'visible'

/** The three tilted portraits of the marketing column. */
const CARDS = [
  {
    image: '/avatars/maya-reyes.png',
    caption: ['ACT', 'CREATE', 'BELONG'],
    className: 'left-0 top-0 z-30 h-[16rem] w-[11.5rem] rotate-[-7deg]',
  },
  {
    image: '/avatars/amelia-park.jpg',
    caption: ['PRODUCE', 'DISCOVER', 'COLLABORATE'],
    className: 'left-[36%] top-[30%] z-20 h-[14rem] w-[12.5rem] rotate-[5deg]',
  },
  {
    image: '/avatars/elias-karam.jpg',
    caption: ['TALENT', 'HAS', 'NO BORDERS'],
    className: 'left-[4%] top-[58%] z-10 h-[15.5rem] w-[11.5rem] rotate-[4deg]',
  },
]

const FEATURES = [
  {
    icon: <Users className="h-[18px] w-[18px]" />,
    title: 'Real opportunities',
    description: 'From indie projects to global productions.',
  },
  {
    icon: <Zap className="h-[18px] w-[18px]" />,
    title: 'A seamless experience',
    description: 'Apply, review, collaborate — all in one place.',
  },
  {
    icon: <Star className="h-[18px] w-[18px]" />,
    title: 'A global community',
    description: 'For talent, creators and industry professionals.',
  },
]

/**
 * Auth surface: editorial pitch on the left, floating portraits in the middle,
 * the form card on the right — the layout of the login design.
 *
 * Under `xl` the decorative middle column drops and the card takes over, so the
 * page stays usable down to phone width.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  topRight,
  compact,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Utility link in the top-right corner of the page. */
  topRight?: ReactNode
  /** Narrower card for the short forms (password reset). */
  compact?: boolean
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      {/* soft page-wide tint, as in the design */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_18%_0%,#FFFDF8_0%,#F6F5F1_45%,#F2F3F8_100%)]"
      />

      <header className="relative z-20 flex items-center justify-between px-6 py-7 sm:px-10">
        <Link to="/" aria-label="Let It Cast — home">
          <Logo size={36} />
        </Link>
        {/* The card footer carries the same link, so this one can go on phones. */}
        {topRight && <div className="hidden text-sm text-muted sm:block">{topRight}</div>}
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1500px] items-center gap-10 px-6 pb-16 sm:px-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)_minmax(540px,600px)] xl:gap-6">
        {/* ── Pitch ── */}
        <motion.section
          initial={animate ? { opacity: 0, y: 14 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-xl xl:pr-4"
        >
          <span className="mb-5 block h-[2px] w-9 bg-ink/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
            People. Stories. Anywhere.
          </span>

          <h1 className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[3.25rem]">
            The global
            <br />
            casting platform
            <br />
            for <span className="text-brand-gradient">what’s next.</span>
          </h1>

          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
            Connecting talent and productions across the world. Simpler. Faster. Fairer.
          </p>

          <ul className="mt-9 flex flex-col gap-5">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card">
                  {feature.icon}
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-ink">{feature.title}</span>
                  <span className="block text-sm text-muted">{feature.description}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 hidden xl:block">
            <span className="mb-3 block h-[2px] w-7 bg-ink/40" />
            <span className="block text-[11px] font-semibold uppercase leading-[1.9] tracking-[0.28em] text-muted">
              Create
              <br />
              Discover
              <br />
              Belong
            </span>
          </div>
        </motion.section>

        {/* ── Floating portraits (decorative) ── */}
        <div aria-hidden className="relative hidden h-[36rem] xl:block">
          <FloatingSquares />
          {CARDS.map((card, index) => (
            <motion.figure
              key={card.caption.join()}
              initial={animate ? { opacity: 0, y: 26, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.08, duration: 0.55, ease: 'easeOut' }}
              className={cn(
                'absolute overflow-hidden rounded-[1.75rem] bg-ink shadow-[0_30px_70px_-30px_rgba(21,20,15,0.55)]',
                card.className,
              )}
            >
              <img
                src={asset(card.image)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-95"
              />
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
              <figcaption className="absolute bottom-4 left-4 right-4">
                <span className="block text-[10px] font-semibold uppercase leading-[1.7] tracking-[0.3em] text-white/95">
                  {card.caption.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
                <span className="mt-2 block h-[2px] w-5 bg-white/60" />
              </figcaption>
            </motion.figure>
          ))}
        </div>

        {/* ── Form card ── */}
        <motion.section
          initial={animate ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
          className="mx-auto w-full max-w-[600px] xl:ml-auto xl:mr-0"
        >
          <div
            className={cn(
              'rounded-panel border border-white/70 bg-[#FBFAF7]/90 shadow-panel backdrop-blur-sm',
              compact ? 'px-7 py-9 sm:px-10' : 'px-6 py-10 sm:px-9',
            )}
          >
            <div className="flex justify-center">
              <Logo size={38} />
            </div>

            <h2 className="mt-7 text-center font-display text-[2.35rem] font-extrabold leading-tight tracking-[-0.025em] text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1.5 text-center text-[15px] text-muted">{subtitle}</p>}

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-7 text-center text-sm text-muted">{footer}</div>}
          </div>
        </motion.section>
      </div>

      <p className="relative z-10 hidden pb-8 pr-10 text-right text-[10px] font-semibold uppercase tracking-[0.28em] text-muted/80 xl:block">
        Same stories. A bigger tomorrow.
      </p>

      <BrandBlobs corner="bottom-left" className="z-0" />
    </div>
  )
}
