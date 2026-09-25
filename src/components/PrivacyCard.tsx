import { useState } from 'react'
import { Download, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, FormError } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { usePrivacyActions } from '@/features/privacy/queries'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

/**
 * Récupérer ses données, et partir.
 *
 * Deux droits qu'on ne met pas dans un sous-menu : ils sont ici, sur le profil,
 * en clair. Et le texte dit ce qui se passe vraiment — anonymisé, pas effacé de
 * l'histoire d'une production — plutôt que de laisser croire à une disparition
 * totale qui n'aurait pas lieu.
 */
export function PrivacyCard() {
  const t = useT()
  const toast = useToast()
  const { exportData, deleteAccount } = usePrivacyActions()
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setError(null)
    try {
      const blob = await exportData.mutateAsync()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `let-it-cast-my-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(errorMessage(exportError, t('privacy.exportFailed')))
    }
  }

  function remove() {
    setError(null)
    // Deux confirmations : la seconde demande d'écrire le mot, parce qu'un clic
    // de trop ne doit pas effacer le travail de quelqu'un.
    if (!window.confirm(t('privacy.deleteConfirm'))) return
    const typed = window.prompt(t('privacy.deleteType'))
    if (typed?.trim().toUpperCase() !== 'DELETE') return

    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        toast(t('privacy.deleted'))
        window.location.assign('/')
      },
      onError: (deleteError) => setError(errorMessage(deleteError, t('privacy.deleteFailed'))),
    })
  }

  return (
    <Card className="flex flex-col gap-3">
      <span className="tech-label inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t('privacy.title')}
      </span>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-col gap-1">
        <p className="text-[13.5px] font-semibold text-ink">{t('privacy.exportTitle')}</p>
        <p className="text-[12.5px] leading-relaxed text-muted">{t('privacy.exportHint')}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-1.5 w-fit"
          icon={<Download className="h-3.5 w-3.5" />}
          disabled={exportData.isPending}
          onClick={download}
        >
          {exportData.isPending ? t('privacy.preparing') : t('privacy.export')}
        </Button>
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <p className="text-[13.5px] font-semibold text-ink">{t('privacy.deleteTitle')}</p>
        <p className="text-[12.5px] leading-relaxed text-muted">{t('privacy.deleteHint')}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 w-fit text-signal-no"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={deleteAccount.isPending}
          onClick={remove}
        >
          {deleteAccount.isPending ? t('privacy.deleting') : t('privacy.delete')}
        </Button>
      </div>
    </Card>
  )
}
