import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudOff, Wifi } from 'lucide-react'
import { useOnline } from '@/lib/pwa'
import { useT } from '@/lib/i18n'

/**
 * La barre qui dit la vérité quand le réseau tombe.
 *
 * Sans elle, un comédien dans un parking de studio voit des écrans vides et des
 * boutons qui ne répondent pas, et croit que l'app est cassée. Elle reste
 * visible tant que la connexion manque, puis confirme brièvement le retour —
 * un état qui s'efface tout seul se raconte mal autrement.
 *
 * Elle se pose **au-dessus de la barre d'onglets** : le pouce n'a rien à faire
 * ici, et masquer la navigation pour une information serait un mauvais échange.
 */
export function OfflineBar() {
  const online = useOnline()
  const t = useT()
  const [justReconnected, setJustReconnected] = useState(false)

  useEffect(() => {
    if (online) return
    // On n'annonce le retour que si on a vraiment vu la coupure.
    return () => setJustReconnected(true)
  }, [online])

  useEffect(() => {
    if (!justReconnected) return
    const timer = setTimeout(() => setJustReconnected(false), 2600)
    return () => clearTimeout(timer)
  }, [justReconnected])

  const show = !online || justReconnected

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-50 flex justify-center px-4 sm:bottom-4"
        >
          <div
            className={
              online
                ? 'flex items-center gap-2 rounded-full bg-signal-good-bg px-3.5 py-2 text-[12.5px] font-semibold text-signal-good shadow-card'
                : 'flex max-w-[min(420px,100%)] items-start gap-2.5 rounded-field bg-ink px-3.5 py-2.5 text-white shadow-card'
            }
          >
            {online ? (
              <>
                <Wifi className="h-4 w-4 shrink-0" />
                {t('app.backOnline')}
              </>
            ) : (
              <>
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{t('app.offline')}</span>
                  <span className="block text-[12px] leading-snug text-white/75">
                    {t('app.offlineHint')}
                  </span>
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
