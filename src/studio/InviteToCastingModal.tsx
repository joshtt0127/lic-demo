import { useState } from 'react'
import { Check, Ticket } from 'lucide-react'
import { FormError, Spinner, Tag } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useInviteTalent } from '@/features/castings/queries'
import { useOrgCastings } from '@/features/studio/queries'
import { CASTING_STATUS_KEY } from '@/features/castings/lifecycle'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * Inviter un comédien sur un casting.
 *
 * C'est ce qui rend la visibilité « sur invitation » utilisable : sans ce
 * chemin, une annonce `invite_only` reste invisible de tout le monde, y compris
 * des gens qu'on voulait y faire venir.
 *
 * Deux limites assumées :
 *   · on ne propose que les castings **publiés**. Inviter sur un brouillon
 *     enverrait quelqu'un vers une page qu'il ne peut pas ouvrir ;
 *   · l'invitation n'est pas une candidature. Elle ouvre la porte, le comédien
 *     décide d'entrer — postuler à sa place serait une autre promesse.
 */
export function InviteToCastingModal({
  talent,
  orgId,
  onClose,
}: {
  talent: { id: string; name: string }
  orgId: string
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const { profile } = useAuth()
  const castings = useOrgCastings(orgId)
  const invite = useInviteTalent(profile?.id)

  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = (castings.data ?? []).filter((casting) => casting.status === 'published')

  async function send() {
    if (!selected) return
    setError(null)
    try {
      await invite.mutateAsync({ castingId: selected, talentId: talent.id, message })
      toast(t('invite.casting.sent', { name: talent.name }))
      onClose()
    } catch (inviteError) {
      setError(errorMessage(inviteError, t('invite.casting.failed')))
    }
  }

  return (
    <EditModal
      open
      title={t('invite.casting.title', { name: talent.name })}
      onClose={onClose}
      onSave={selected ? send : undefined}
      saveLabel={invite.isPending ? t('invite.casting.sending') : t('invite.casting.send')}
    >
      {error && <FormError>{error}</FormError>}

      {castings.isLoading ? (
        <Spinner />
      ) : open.length === 0 ? (
        <p className="text-[13px] text-muted">{t('invite.casting.none')}</p>
      ) : (
        <ul className="flex max-h-[38vh] flex-col gap-2 overflow-y-auto">
          {open.map((casting) => (
            <li key={casting.id}>
              <button
                type="button"
                onClick={() => setSelected(casting.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-field border p-3 text-left transition-colors',
                  selected === casting.id
                    ? 'border-ink/30 bg-paper'
                    : 'border-line hover:border-ink/20',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    selected === casting.id ? 'bg-ink text-white' : 'bg-paper text-muted',
                  )}
                >
                  {selected === casting.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Ticket className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">
                    {casting.title}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {casting.project?.title}
                  </span>
                </span>
                <Tag tone="neutral">{t(CASTING_STATUS_KEY[casting.status])}</Tag>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 && (
        <Field label={t('invite.casting.message')}>
          <TextArea
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('invite.casting.messagePlaceholder')}
          />
        </Field>
      )}

      <p className="text-[12px] leading-relaxed text-muted">{t('invite.casting.hint')}</p>
    </EditModal>
  )
}
