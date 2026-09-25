import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { FormError, Input } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useStudioMutations } from '@/features/studio/queries'
import { errorMessage } from '@/lib/supabase'
import type { CastingCallRow } from '@/types/database'

/**
 * Modifier une annonce, y compris après sa publication.
 *
 * La règle vit en base depuis la Phase 3 : une modification est historisée, et
 * celles qui changent le travail du comédien — date limite, lieu — préviennent
 * les candidats. Mais aucun écran ne permettait de modifier quoi que ce soit
 * une fois l'annonce en ligne : la règle existait sans son geste.
 *
 * L'avertissement n'est affiché **que** si des gens ont déjà candidaté. Prévenir
 * d'un envoi de notifications quand il n'y a personne à notifier serait une
 * inquiétude gratuite.
 */
export function EditCastingModal({
  casting,
  orgId,
  profileId,
  applicantCount,
  onClose,
}: {
  casting: CastingCallRow
  orgId: string | undefined
  profileId: string | undefined
  applicantCount: number
  onClose: () => void
}) {
  const toast = useToast()
  const mutations = useStudioMutations(orgId, profileId)

  const [form, setForm] = useState({
    title: casting.title,
    description: casting.description ?? '',
    location: casting.location ?? '',
    compensation: casting.compensation ?? '',
    deadlineAt: casting.deadline_at ? casting.deadline_at.slice(0, 10) : '',
  })
  const [error, setError] = useState<string | null>(null)

  const published = casting.status === 'published'
  const deadlineChanged =
    (form.deadlineAt || null) !== (casting.deadline_at ? casting.deadline_at.slice(0, 10) : null)
  const locationChanged = form.location !== (casting.location ?? '')
  // Qui sera prévenu, et de quoi : deux questions différentes.
  //   · `hasApplicants` décide de l'avertissement — il doit s'afficher **avant**
  //     qu'on tape quoi que ce soit, sinon il prévient trop tard ;
  //   · `willNotify` décide du message de confirmation, une fois qu'on sait ce
  //     qui a réellement changé.
  const hasApplicants = published && applicantCount > 0
  const willNotify = hasApplicants && (deadlineChanged || locationChanged)

  async function save() {
    setError(null)
    if (!form.title.trim()) {
      setError('A casting needs a title')
      return
    }
    try {
      await mutations.updateCasting.mutateAsync({
        id: casting.id,
        input: {
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          compensation: form.compensation || null,
          deadlineAt: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
        },
      })
      toast(willNotify ? 'Saved — applicants have been told' : 'Casting updated')
      onClose()
    } catch (saveError) {
      setError(errorMessage(saveError, 'This casting could not be updated'))
    }
  }

  return (
    <EditModal
      open
      title="Edit this casting"
      onClose={onClose}
      onSave={save}
      saveLabel={mutations.updateCasting.isPending ? 'Saving…' : 'Save changes'}
    >
      {error && <FormError>{error}</FormError>}

      {hasApplicants && (
        <p className="flex items-start gap-2 rounded-field bg-cream p-3 text-[12.5px] leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {applicantCount} {applicantCount === 1 ? 'person has' : 'people have'} applied. Changing the
          deadline or the location tells them — the rest is saved quietly.
        </p>
      )}

      <Field label="Title">
        <Input
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
      </Field>

      <Field label="Description">
        <TextArea
          rows={3}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </Field>

      <Field label="Location">
        <Input
          value={form.location}
          onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
          placeholder="Marseille"
        />
      </Field>

      <Field label="Submissions close">
        <Input
          type="date"
          value={form.deadlineAt}
          onChange={(event) =>
            setForm((current) => ({ ...current, deadlineAt: event.target.value }))
          }
        />
      </Field>

      <Field label="Compensation">
        <Input
          value={form.compensation}
          onChange={(event) =>
            setForm((current) => ({ ...current, compensation: event.target.value }))
          }
        />
      </Field>
    </EditModal>
  )
}
