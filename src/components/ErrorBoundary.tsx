import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Card, Logo } from '@/components/ui'
import { reportError } from '@/lib/report-error'

/**
 * Le dernier filet.
 *
 * Sans lui, une erreur de rendu laisse un écran **blanc** : pas de message, pas
 * de bouton, rien à raconter au support. Avec lui, la personne voit ce qui s'est
 * passé et peut repartir, et l'incident arrive dans la console d'exploitation
 * sans qu'elle ait à écrire à qui que ce soit.
 *
 * Une classe, parce que React n'offre pas d'équivalent en composant de fonction.
 */
type State = { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('render', error)
    // Utile en développement, et sans effet sur la remontée ci-dessus.
    console.error('Rendering failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-6">
        <Card className="w-full max-w-md text-center">
          <div className="flex justify-center">
            <Logo size={26} />
          </div>
          <h1 className="mt-6 text-lg font-bold tracking-tight text-ink">
            Something broke on this screen
          </h1>
          <p className="mt-2 text-sm text-muted">
            We have been told. Nothing you sent is lost — reloading usually gets you back.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Card>
      </div>
    )
  }
}
