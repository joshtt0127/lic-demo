import { Link } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { Logo } from '@/components/ui'
import { PhoneFrame } from '@/components/PhoneFrame'

/**
 * The talent app at phone size, inside a device frame — for a demo on a big
 * screen.
 *
 * It frames the *live* app rather than a copy of it: same routes, same session,
 * same database. A second implementation of the talent surface would drift from
 * the real one within a week.
 */
export function PhonePreview() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 sm:px-6">
        <Link to="/" className="inline-flex items-center text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Logo size={22} />
        <span className="ml-2 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <Smartphone className="h-3.5 w-3.5" />
          Talent app, phone size
        </span>
        <Link
          to="/talent"
          className="ml-auto inline-flex h-9 items-center rounded-btn px-2 text-[13px] font-semibold text-link hover:bg-link/5"
        >
          Open full screen
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <PhoneFrame>
          {/* The real app: signing in here signs you in there. */}
          <iframe
            src="/talent"
            title="Let It Cast — talent app"
            className="h-full w-full border-0"
            allow="camera; microphone"
          />
        </PhoneFrame>
      </div>
    </div>
  )
}
