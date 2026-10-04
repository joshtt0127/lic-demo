import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { Button, FormError, FormField, TextField } from '@/components/ui'
import { TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { PosterField } from '@/components/upload/PosterField'
import { useStudioMutations } from '@/features/studio/queries'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { VISIBILITIES } from '@/studio/NewCastingPage'
import type { CastingCallRow } from '@/types/database'

/**
 * Modifier une annonce, y compris après sa publication — et la supprimer.
 *
 * La règle vit en base depuis la Phase 3 : une modification est historisée, et
 * celles qui changent le travail du comédien — date limite, lieu — préviennent
 * les candidats. L'avertissement n'est affiché **que** si des gens ont déjà
 * candidaté : prévenir d'un envoi quand il n'y a personne à notifier serait
 * une inquiétude gratuite.
 *
 * Retour de test : la petite fenêtre (un champ par ligne, rien d'autre) ne
 * suffisait pas. C'est maintenant un vrai éditeur : l'affiche à gauche, les
 * informations regroupées comme à la création, la visibilité, et la
 * suppression en bas, séparée du reste.
 *
 * Supprimer est irréversible et emporte, en base (cascade), les rôles, les
 * candidatures et leurs self-tapes. Si des comédiens ont candidaté, on le dit
 * en chiffres et on fait retaper le titre ; sinon une confirmation suffit.
 * Fermer l'annonce reste l'alternative proposée.
 */
export function EditCastingModal({
  casting,
  project,
  orgId,
  profileId,
  applicantCount,
  roleCount,
  mayDelete,
  onClose,
}: {
  casting: CastingCallRow
  /** Le projet porte l'affiche : elle s'enregistre dès qu'elle est déposée. */
  project: { id: string; poster_url: string | null } | null
  orgId: string | undefined
  profileId: string | undefined
  applicantCount: number
  roleCount: number
  mayDelete: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const mutations = useStudioMutations(orgId, profileId)

  const [form, setForm] = useState({
    title: casting.title,
    description: casting.description ?? '',
    location: casting.location ?? '',
    compensation: casting.compensation ?? '',
    deadlineAt: casting.deadline_at ? casting.deadline_at.slice(0, 10) : '',
    visibility: casting.visibility,
  })
  const [error, setError] = useState<string | null>(null)
  const [poster, setPoster] = useState(project?.poster_url ?? null)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

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
  const mustType = applicantCount > 0
  const deleteReady = !mustType || typed.trim() === casting.title.trim()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          // Une ancienne valeur (`private`) n'est réécrite que si l'on en choisit une autre.
          ...(form.visibility !== casting.visibility && form.visibility !== 'private'
            ? { visibility: form.visibility }
            : {}),
        },
      })
      toast(willNotify ? 'Saved — applicants have been told' : 'Casting updated')
      onClose()
    } catch (saveError) {
      setError(errorMessage(saveError, 'This casting could not be updated'))
    }
  }

  async function remove() {
    setError(null)
    try {
      await mutations.deleteCasting.mutateAsync(casting.id)
      toast('Casting deleted')
      navigate('/studio/casting-calls', { replace: true })
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'This casting could not be deleted'))
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-casting-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] border border-line bg-card shadow-card-hover"
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <span className="tech-label">
              {published ? 'Published' : casting.status === 'draft' ? 'Draft' : 'Closed'} ·{' '}
              {roleCount} {roleCount === 1 ? 'role' : 'roles'} · {applicantCount}{' '}
              {applicantCount === 1 ? 'applicant' : 'applicants'}
            </span>
            <h2
              id="edit-casting-title"
              className="mt-1 truncate font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink"
            >
              Edit casting
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-5">
              <FormError>{error}</FormError>
            </div>
          )}

          {hasApplicants && (
            <p className="mb-5 flex items-start gap-2 rounded-field bg-cream p-3 text-[13px] leading-relaxed text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {applicantCount} {applicantCount === 1 ? 'person has' : 'people have'} applied.
              Changing the deadline or the location tells them — the rest is saved quietly.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            {project && (
              <FormField label="Poster" plainLabel optional>
                <PosterField
                  stacked
                  profileId={profileId}
                  value={poster}
                  saving={mutations.setProjectPoster.isPending}
                  onChange={async (url) => {
                    await mutations.setProjectPoster.mutateAsync({ id: project.id, posterUrl: url })
                    setPoster(url)
                    toast(url ? 'Poster saved' : 'Poster removed')
                  }}
                />
              </FormField>
            )}

            <div className="flex flex-col gap-5">
              <TextField
                label="Casting title"
                plainLabel
                fieldSize="lg"
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Location"
                  plainLabel
                  placeholder="Los Angeles"
                  value={form.location}
                  onChange={(event) => set('location', event.target.value)}
                />
                <TextField
                  label="Deadline"
                  plainLabel
                  type="date"
                  value={form.deadlineAt}
                  onChange={(event) => set('deadlineAt', event.target.value)}
                />
                <TextField
                  label="Compensation"
                  plainLabel
                  placeholder="SAG scale"
                  value={form.compensation}
                  onChange={(event) => set('compensation', event.target.value)}
                />
              </div>

              <FormField label="Description" htmlFor="edit-casting-description" plainLabel optional>
                <TextArea
                  id="edit-casting-description"
                  rows={6}
                  placeholder="What talents should know before applying."
                  value={form.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              </FormField>
            </div>
          </div>

          <div className="mt-6">
          <FormField label="Who can see it" plainLabel>
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIBILITIES.map(({ value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('visibility', value)}
                  className={cn(
                    'rounded-field border p-3 text-left transition-colors',
                    form.visibility === value
                      ? 'border-ink/30 bg-paper'
                      : 'border-line hover:border-ink/20',
                  )}
                >
                  <span className="block text-[13.5px] font-bold text-ink">{label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{hint}</span>
                </button>
              ))}
            </div>
          </FormField>
          </div>

          {/* Suppression, séparée du reste */}
          {mayDelete && (
            <div className="mt-8 rounded-card border border-signal-no/25 bg-signal-no/[0.04] p-4">
              {!confirming ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-bold text-ink">Delete this casting</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Removes the casting, its roles and every application. This cannot be undone.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-btn border border-signal-no/40 px-4 text-[13.5px] font-bold text-signal-no transition-colors hover:bg-signal-no/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete casting
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px] font-bold text-ink">Delete “{casting.title}”?</p>
                  <p className="text-[13px] leading-relaxed text-ink/80">
                    {applicantCount > 0
                      ? `${applicantCount} ${applicantCount === 1 ? 'talent has' : 'talents have'} applied. Their applications and self-tapes for this casting will be deleted too. If you only want to stop new submissions, close the casting instead.`
                      : `The casting and its ${roleCount} ${roleCount === 1 ? 'role' : 'roles'} will be deleted.`}
                  </p>
                  {mustType && (
                    <TextField
                      label="Type the casting title to confirm"
                      plainLabel
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      placeholder={casting.title}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!deleteReady || mutations.deleteCasting.isPending}
                      onClick={() => void remove()}
                      className="inline-flex h-10 items-center gap-2 rounded-btn bg-signal-no px-4 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                      {mutations.deleteCasting.isPending ? 'Deleting…' : 'Delete for good'}
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setConfirming(false)
                        setTyped('')
                      }}
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={mutations.updateCasting.isPending}>
            {mutations.updateCasting.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
