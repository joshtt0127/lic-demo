import { cn } from '@/lib/cn'

/**
 * The brand's decorative corner: three tilted rounded squares (yellow, red,
 * blue — the logo mark, exploded) over a soft coloured glow.
 *
 * Purely decorative, so `aria-hidden`, and `pointer-events-none` so it never
 * eats a click. Used on the auth and onboarding surfaces.
 */
export function BrandBlobs({
  corner = 'bottom-left',
  className,
}: {
  corner?: 'bottom-left' | 'bottom-right' | 'top-right'
  className?: string
}) {
  const position =
    corner === 'bottom-left'
      ? '-bottom-24 -left-24'
      : corner === 'bottom-right'
        ? '-bottom-20 -right-24'
        : '-top-24 -right-24'

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute z-0 h-[26rem] w-[26rem]', position, className)}
    >
      {/* glow */}
      <div className="absolute inset-0 opacity-[0.55] blur-3xl">
        <div className="absolute left-[18%] top-[22%] h-52 w-52 rounded-full bg-[#F6C544]" />
        <div className="absolute left-[46%] top-[34%] h-40 w-40 rounded-full bg-[#F58A8A]" />
        <div className="absolute left-[30%] top-[52%] h-56 w-56 rounded-full bg-[#7EA6FF]" />
      </div>

      {/* squares — same trio as the logo mark, scattered */}
      <div className="absolute left-[14%] top-[20%] h-36 w-36 rotate-[-12deg] rounded-[2rem] bg-gradient-to-br from-[#FFD447] to-[#F6B63C] opacity-90 shadow-[0_18px_40px_-18px_rgba(246,182,60,0.7)]" />
      <div className="absolute left-[45%] top-[36%] h-20 w-20 rotate-[14deg] rounded-[1.25rem] bg-gradient-to-br from-[#FF6B60] to-[#E0483D] opacity-90 shadow-[0_18px_40px_-18px_rgba(224,72,61,0.6)]" />
      <div className="absolute left-[26%] top-[54%] h-48 w-48 rotate-[-8deg] rounded-[2.5rem] bg-gradient-to-br from-[#5B8DEF] to-[#2563EB] opacity-90 shadow-[0_24px_50px_-20px_rgba(37,99,235,0.6)]" />
    </div>
  )
}

/**
 * Floating accent squares behind the login photo stack — the loose ones in the
 * upper half of the mockup.
 */
export function FloatingSquares() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div className="absolute left-[52%] top-[2%] h-28 w-28 rotate-[8deg] rounded-[1.75rem] bg-gradient-to-br from-[#FFD447] to-[#F6B63C] shadow-[0_20px_44px_-20px_rgba(246,182,60,0.8)]" />
      <div className="absolute left-[72%] top-[22%] h-20 w-20 rotate-[-10deg] rounded-[1.25rem] bg-gradient-to-br from-[#FF6B60] to-[#E0483D] shadow-[0_20px_44px_-20px_rgba(224,72,61,0.7)]" />
      <div className="absolute left-[30%] top-[78%] h-36 w-36 rotate-[10deg] rounded-[2rem] bg-gradient-to-br from-[#5B8DEF] to-[#2563EB] shadow-[0_24px_50px_-22px_rgba(37,99,235,0.7)]" />
      <div className="absolute left-[8%] top-[46%] h-64 w-64 rounded-full bg-[#F7C9D9] opacity-40 blur-3xl" />
      <div className="absolute left-[58%] top-[58%] h-64 w-64 rounded-full bg-[#C9D8F7] opacity-50 blur-3xl" />
    </div>
  )
}
