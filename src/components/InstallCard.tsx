import { useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { isStandalone, useInstall } from '@/lib/pwa'
import { useT } from '@/lib/i18n'

const DISMISSED = 'lic.install.dismissed'

/**
 * L'invitation à garder l'app sur l'écran d'accueil.
 *
 * Elle n'apparaît **que si l'installation est réellement possible** : soit le
 * navigateur a proposé l'événement d'installation, soit on est sur iOS où il
 * faut passer par le menu Partager. Un bouton « Installer » qui ne fait rien
 * serait pire que pas de bouton.
 *
 * Refusée une fois, elle ne revient pas : le choix est gardé dans le
 * navigateur, pas en base — c'est une préférence d'appareil, pas de compte.
 */
export function InstallCard() {
  const t = useT()
  const { canPrompt, needsIosSteps, install } = useInstall()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === '1'
    } catch {
      return false
    }
  })

  if (dismissed || isStandalone() || (!canPrompt && !needsIosSteps)) return null

  function close() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Navigation privée : la carte réapparaîtra, tant pis.
    }
  }

  return (
    <div className="relative flex items-start gap-3 rounded-card border border-line bg-card p-3.5 shadow-card">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-paper text-ink">
        <Smartphone className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="pr-6 text-[13.5px] font-bold leading-snug text-ink">{t('app.installTitle')}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{t('app.installBody')}</p>

        {canPrompt ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void install().then((outcome) => outcome !== 'dismissed' && close())}>
              {t('app.installAction')}
            </Button>
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-[34px] items-center px-1 text-[12.5px] font-semibold text-muted hover:text-ink"
            >
              {t('app.installLater')}
            </button>
          </div>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-btn bg-paper px-2.5 py-1.5 text-[12.5px] font-semibold text-ink">
            <Share className="h-3.5 w-3.5 shrink-0" />
            {t('app.installIos')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label={t('app.installLater')}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
