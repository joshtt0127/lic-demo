import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Film } from 'lucide-react'
import { Avatar, Button, FormError, FormField, Spinner } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { SelfTapePanel } from '@/components/upload/SelfTapePanel'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useApplicationMutations } from '@/features/applications/queries'
import { useTalentProfile } from '@/features/talent/queries'
import { missingForApplication } from '@/features/talent/completion'
import { publicUrl } from '@/lib/storage'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/**
 * Applying, then taping — in one go.
 *
 * The form sends the application, and the modal immediately offers to record
 * the self-tape for that role: the tape is the point of the application, and
 * sending it should not mean finding the audition again later.
 */
export function ApplyModal({
  role,
  castingTitle,
  onClose,
}: {
  role: RoleRow
  castingTitle: string
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const profileId = profile?.id
  const talent = useTalentProfile(profileId)
  const { apply } = useApplicationMutations(profileId)

  // Ce qu'il manque pour être jugé — même règle que la base, dite avant le clic
  // plutôt qu'après le refus.
  const gaps = talent.data ? missingForApplication(talent.data) : []

  const media = talent.data?.media ?? []
  const headshots = media.filter((asset) => asset.kind === 'headshot' || asset.kind === 'portfolio')
  const showreels = media.filter((asset) => asset.kind === 'showreel')

  const [note, setNote] = useState('')
  const [headshotId, setHeadshotId] = useState<string | null>(headshots[0]?.id ?? null)
  const [showreelId, setShowreelId] = useState<string | null>(showreels[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [applicationId, setApplicationId] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      const application = await apply.mutateAsync({
        roleId: role.id,
        note,
        headshotId,
        showreelId,
      })
      toast(t('apply.sent', { role: role.name }))
      setApplicationId(application.id)
    } catch (applyError) {
      setError(errorMessage(applyError, t('apply.failed')))
    }
  }

  // ── Step 2: the tape, right now ──
  if (applicationId) {
    return (
      <EditModal open title={t('apply.tapeTitle', { role: role.name })} onClose={onClose}>
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Check className="h-4 w-4 text-signal-good" />
          {t('apply.tapeIntro')}
        </p>

        <SelfTapePanel
          applicationId={applicationId}
          instructions={role.selftape_instructions}
        />

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </EditModal>
    )
  }

  // ── Un profil qui ne permet pas de juger : on le dit, on ne bloque pas un
  //    bouton sans explication ──
  if (gaps.length > 0) {
    return (
      <EditModal open title={t('apply.missingTitle')} onClose={onClose}>
        <p className="text-[13px] text-muted">{t('apply.missingHint')}</p>
        <ul className="flex flex-col gap-2">
          {gaps.map((gap) => (
            <li key={gap} className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-no" />
              {t(`apply.missing.${gap}`)}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => navigate('/talent/profile')}>
            {t('apply.completeProfile')}
          </Button>
        </div>
      </EditModal>
    )
  }

  return (
    <EditModal
      open
      title={t('apply.title', { role: role.name })}
      onClose={onClose}
      onSave={submit}
      saveLabel={apply.isPending ? t('apply.sending') : t('apply.submit')}
    >
      {error && <FormError>{error}</FormError>}

      <p className="text-[13px] text-muted">
        {t('apply.intro', { casting: castingTitle })}
      </p>

      <Field label={t('apply.note')}>
        <TextArea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('apply.notePlaceholder')}
        />
      </Field>

      <FormField label={t('apply.headshot')} plainLabel>
        {headshots.length === 0 ? (
          <p className="text-[13px] text-muted">
            {t('apply.noHeadshot')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {headshots.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setHeadshotId(asset.id)}
                className={cn(
                  'h-20 w-16 overflow-hidden rounded-btn border-2 transition-colors',
                  headshotId === asset.id ? 'border-ink' : 'border-transparent opacity-70',
                )}
              >
                <img
                  src={publicUrl(asset.bucket, asset.path)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </FormField>

      <FormField label={t('apply.showreel')} plainLabel>
        {showreels.length === 0 ? (
          <p className="text-[13px] text-muted">{t('apply.noShowreel')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {showreels.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setShowreelId(asset.id === showreelId ? null : asset.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-btn border px-3 py-2 text-left text-[13px] transition-colors',
                  showreelId === asset.id
                    ? 'border-ink bg-paper text-ink'
                    : 'border-line text-muted hover:border-ink/30',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5">
                  {showreelId === asset.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {asset.caption ?? asset.path.split('/').pop()}
                </span>
              </button>
            ))}
          </div>
        )}
      </FormField>

      {apply.isPending && (
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner />
          {t('apply.sendingLong')}
        </span>
      )}

      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Avatar src={profile?.avatar_url ?? undefined} name="You" size="xs" />
        {t('apply.submittedAs', {
          name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
        })}
      </p>
    </EditModal>
  )
}
