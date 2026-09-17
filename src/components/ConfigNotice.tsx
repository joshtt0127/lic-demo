import { Database, Terminal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, Logo } from '@/components/ui'

/**
 * Shown instead of a crash when the app runs without backend credentials —
 * a fresh clone before `.env.local` exists. Never a blank page.
 */
export function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={32} />
          <span className="tech-label mt-6">Setup required</span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
            No backend connected
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Accounts, profiles and castings need a Supabase project. The demo tour still
            works without one.
          </p>
        </div>

        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-paper text-ink">
              <Database className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <div className="font-semibold text-ink">1 · Create the project</div>
              <code className="mt-1 block rounded-btn bg-paper px-2.5 py-1.5 font-mono text-xs text-muted">
                npm run db -- create-project
              </code>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-paper text-ink">
              <Terminal className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <div className="font-semibold text-ink">2 · Copy the keys, then migrate</div>
              <code className="mt-1 block rounded-btn bg-paper px-2.5 py-1.5 font-mono text-xs text-muted">
                cp .env.example .env.local && npm run db:push
              </code>
            </div>
          </div>

          <p className="text-xs text-muted">
            Full setup in <span className="font-mono">docs/DATABASE.md</span>.
          </p>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm font-medium text-link hover:underline">
            Back to the demo tour
          </Link>
        </div>
      </div>
    </div>
  )
}
