import { useState } from 'react'
import { Flag, MoreHorizontal, ShieldOff } from 'lucide-react'
import { FormError } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useModeration } from '@/features/moderation/queries'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import type { ReportReason } from '@/types/database'

/**
 * Le recours, là où le problème apparaît.
 *
 * Deux gestes, volontairement distincts jusque dans les mots : **signaler**
 * s'adresse à LIC et ouvre un dossier — rien ne disparaît, parce qu'un
 * signalement n'est pas un verdict ; **bloquer** est personnel et immédiat, et
 * coupe ce qui vient sans toucher à l'historique professionnel des deux
 * personnes.
 */
const REASONS: ReportReason[] = [
  'harassment',
  'inappropriate',
  'spam',
  'impersonation',
  'fraudulent_casting',
  'other',
]

export function ReportOrBlock({
  subjectType,
  subjectId,
  authorId,
  authorName,
}: {
  subjectType: 'profile' | 'post' | 'casting_call' | 'message'
  subjectId: string
  /** Qui bloquer — l'auteur, qui n'est pas forcément le sujet signalé. */
  authorId?: string | null
  authorName: string
}) {
  const t = useT()
  const toast = useToast()
  const { profile } = useAuth()
  const { report, block } = useModeration(profile?.id)

  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState<ReportReason>('harassment')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mine = authorId && profile?.id === authorId
  if (mine) return null

  async function send() {
    setError(null)
    try {
      await report.mutateAsync({ subjectType, subjectId, reason, details })
      toast(t('moderation.reported'))
      setReporting(false)
      setOpen(false)
    } catch (reportError) {
      setError(errorMessage(reportError, t('moderation.reportFailed')))
    }
  }

  function doBlock() {
    if (!authorId) return
    if (!window.confirm(t('moderation.blockConfirm', { name: authorName }))) return
    block.mutate(authorId, {
      onSuccess: () => {
        toast(t('moderation.blocked', { name: authorName }))
        setOpen(false)
      },
      onError: (blockError) => setError(errorMessage(blockError, t('moderation.blockFailed'))),
    })
  }

  return (
    <>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={t('moderation.more')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <MoreHorizontal className="h-[17px] w-[17px]" />
        </button>

        {open && (
          <div
            className={cn(
              'absolute right-0 top-10 z-30 w-[220px] overflow-hidden rounded-field',
              'border border-line bg-card shadow-card-hover',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setReporting(true)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] text-ink hover:bg-paper"
            >
              <Flag className="h-4 w-4 text-muted" />
              {t('moderation.report')}
            </button>
            {authorId && (
              <button
                type="button"
                onClick={doBlock}
                className="flex w-full items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-left text-[13.5px] text-signal-no hover:bg-signal-no/5"
              >
                <ShieldOff className="h-4 w-4" />
                {t('moderation.block', { name: authorName })}
              </button>
            )}
          </div>
        )}
      </div>

      {reporting && (
        <EditModal
          open
          title={t('moderation.reportTitle')}
          onClose={() => setReporting(false)}
          onSave={send}
          saveLabel={report.isPending ? t('moderation.sending') : t('moderation.send')}
        >
          {error && <FormError>{error}</FormError>}
          <p className="text-[13px] text-muted">{t('moderation.reportHint')}</p>

          <div className="flex flex-wrap gap-2">
            {REASONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setReason(value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  reason === value
                    ? 'border-ink/30 bg-paper text-ink'
                    : 'border-line text-muted hover:border-ink/20',
                )}
              >
                {t(`moderation.reason.${value}`)}
              </button>
            ))}
          </div>

          <Field label={t('moderation.details')}>
            <TextArea
              rows={3}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t('moderation.detailsPlaceholder')}
            />
          </Field>
        </EditModal>
      )}
    </>
  )
}

/** Raccourci pour les endroits qui n'ont besoin que du bouton de signalement. */
export function ReportButton(props: Parameters<typeof ReportOrBlock>[0]) {
  return <ReportOrBlock {...props} />
}
