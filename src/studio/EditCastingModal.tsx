import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Clapperboard, Lock, Megaphone, Trash2, Users, X } from 'lucide-react'
import { Button, FormError, FormField, SelectInput, TextField } from '@/components/ui'
import { TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { PosterField } from '@/components/upload/PosterField'
import { useOrgProjects, useStudioMutations } from '@/features/studio/queries'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { PRODUCTION_TYPES, VISIBILITIES } from '@/studio/NewCastingPage'
import type { CastingCallRow, ProjectRow } from '@/types/database'

/**
 * Modifier une annonce, y compris après sa publication — et la supprimer.
 *
 * La règle vit en base depuis la Phase 3 : une modification est historisée, et
 * celles qui changent le travail du comédien — date limite, lieu — préviennent
 * les candidats. L'avertissement n'est affiché **que** si des gens ont déjà
 * candidaté : prévenir d'un envoi quand il n'y a personne à notifier serait
 * une inquiétude gratuite.
 *
 * Retour de test : tout doit pouvoir se modifier ici, y compris ce qui vit sur
 * le projet (synopsis, note du réalisateur, équipe, tournage). L'éditeur a donc
 * deux parties, « The casting » et « The project », comme à la création. Le
 * projet n'est réécrit que s'il a changé, et toujours en entier : `updateProject`
 * remet à null tout champ absent.
 *
 * Supprimer est irréversible et emporte, en base (cascade), les rôles, les
 * candidatures et leurs self-tapes. Si des comédiens ont candidaté, on le dit
 * en chiffres et on fait retaper le titre ; sinon une confirmation suffit.
 * Fermer l'annonce reste l'alternative proposée.
 */

type ProjectForm = {
  title: string
  productionType: string
  genre: string
  companyName: string
  directorName: string
  castingDirectorName: string
  shootingLocation: string
  shootingStart: string
  shootingEnd: string
  synopsis: string
  directorBrief: string
}

function toProjectForm(row: ProjectRow): ProjectForm {
  return {
    title: row.title,
    productionType: row.production_type ?? '',
    genre: row.genre ?? '',
    companyName: row.company_name ?? '',
    directorName: row.director_name ?? '',
    castingDirectorName: row.casting_director_name ?? '',
    shootingLocation: row.shooting_location ?? '',
    shootingStart: row.shooting_start ? row.shooting_start.slice(0, 10) : '',
    shootingEnd: row.shooting_end ? row.shooting_end.slice(0, 10) : '',
    synopsis: row.synopsis ?? '',
    directorBrief: row.director_brief ?? '',
  }
}

const FORMATS = [
  { value: 'scripted', label: 'Scripted', hint: 'Roles with characters and sides.' },
  { value: 'non_scripted', label: 'Non scripted', hint: 'Reality, game shows, documentary.' },
] as const

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
  const projects = useOrgProjects(orgId)
  const projectRow = project ? projects.data?.find((row) => row.id === project.id) : undefined

  const [form, setForm] = useState({
    title: casting.title,
    description: casting.description ?? '',
    location: casting.location ?? '',
    compensation: casting.compensation ?? '',
    deadlineAt: casting.deadline_at ? casting.deadline_at.slice(0, 10) : '',
    format: casting.format,
    visibility: casting.visibility,
  })
  // Le projet complet arrive par sa propre requête : le formulaire se remplit
  // une fois, à son arrivée, puis ne bouge plus.
  const [projectForm, setProjectForm] = useState<ProjectForm | null>(null)
  const [projectInitial, setProjectInitial] = useState<ProjectForm | null>(null)
  useEffect(() => {
    if (projectRow && !projectForm) {
      setProjectForm(toProjectForm(projectRow))
      setProjectInitial(toProjectForm(projectRow))
    }
  }, [projectRow, projectForm])

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
  const saving = mutations.updateCasting.isPending || mutations.updateProject.isPending

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
    if (projectForm && !projectForm.title.trim()) {
      setError('The project needs a title')
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
          format: form.format,
          // Une ancienne valeur (`private`) n'est réécrite que si l'on en choisit une autre.
          ...(form.visibility !== casting.visibility && form.visibility !== 'private'
            ? { visibility: form.visibility }
            : {}),
        },
      })
      if (
        project &&
        projectRow &&
        projectForm &&
        JSON.stringify(projectForm) !== JSON.stringify(projectInitial)
      ) {
        await mutations.updateProject.mutateAsync({
          id: project.id,
          input: {
            title: projectForm.title,
            productionType: projectForm.productionType || null,
            genre: projectForm.genre || null,
            companyName: projectForm.companyName || null,
            directorName: projectForm.directorName || null,
            castingDirectorName: projectForm.castingDirectorName || null,
            shootingLocation: projectForm.shootingLocation || null,
            shootingStart: projectForm.shootingStart || null,
            shootingEnd: projectForm.shootingEnd || null,
            synopsis: projectForm.synopsis || null,
            directorBrief: projectForm.directorBrief || null,
            // Champs que l'éditeur ne montre pas : on les renvoie tels quels.
            posterUrl: poster,
            status: projectRow.status,
          },
        })
      }
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
  const setProject = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setProjectForm((current) => (current ? { ...current, [key]: value } : current))

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-casting-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-[920px] flex-col overflow-hidden rounded-t-[28px] border border-line bg-card shadow-card-hover sm:max-h-[92vh] sm:rounded-[28px]"
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
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
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
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

          <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
            {project && (
              <div className="mx-auto w-full max-w-[220px] md:mx-0">
                <FormField label="Poster" plainLabel optional>
                  <PosterField
                    stacked
                    profileId={profileId}
                    value={poster}
                    saving={mutations.setProjectPoster.isPending}
                    onChange={async (url) => {
                      await mutations.setProjectPoster.mutateAsync({
                        id: project.id,
                        posterUrl: url,
                      })
                      setPoster(url)
                      toast(url ? 'Poster saved' : 'Poster removed')
                    }}
                  />
                </FormField>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-8">
              {/* L'annonce */}
              <section className="flex flex-col gap-5">
                <SectionTitle icon={Megaphone} title="The casting" />
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

                <FormField label="Format" plainLabel>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FORMATS.map(({ value, label, hint }) => (
                      <ChoiceCard
                        key={value}
                        active={form.format === value}
                        label={label}
                        hint={hint}
                        onClick={() => set('format', value)}
                      />
                    ))}
                  </div>
                </FormField>

                <FormField
                  label="Description"
                  htmlFor="edit-casting-description"
                  plainLabel
                  optional
                >
                  <TextArea
                    id="edit-casting-description"
                    rows={5}
                    placeholder="What talents should know before applying."
                    value={form.description}
                    onChange={(event) => set('description', event.target.value)}
                  />
                </FormField>
              </section>

              {/* Le projet */}
              {project && (
                <section className="flex flex-col gap-5">
                  <SectionTitle icon={Clapperboard} title="The project" />
                  {!projectForm ? (
                    <p className="text-[13px] text-muted">
                      {projects.isError ? 'The project could not be loaded.' : 'Loading the project…'}
                    </p>
                  ) : (
                    <>
                      <TextField
                        label="Project title"
                        plainLabel
                        value={projectForm.title}
                        onChange={(event) => setProject('title', event.target.value)}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Production type" htmlFor="edit-production-type" plainLabel>
                          <SelectInput
                            id="edit-production-type"
                            value={projectForm.productionType}
                            onChange={(event) => setProject('productionType', event.target.value)}
                          >
                            {!PRODUCTION_TYPES.includes(projectForm.productionType) && (
                              <option value={projectForm.productionType}>
                                {projectForm.productionType || 'Not set'}
                              </option>
                            )}
                            {PRODUCTION_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </SelectInput>
                        </FormField>
                        <TextField
                          label="Genre"
                          plainLabel
                          optional
                          placeholder="Psychological thriller"
                          value={projectForm.genre}
                          onChange={(event) => setProject('genre', event.target.value)}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <TextField
                          label="Production company"
                          plainLabel
                          optional
                          value={projectForm.companyName}
                          onChange={(event) => setProject('companyName', event.target.value)}
                        />
                        <TextField
                          label="Director"
                          plainLabel
                          optional
                          value={projectForm.directorName}
                          onChange={(event) => setProject('directorName', event.target.value)}
                        />
                        <TextField
                          label="Casting director"
                          plainLabel
                          optional
                          value={projectForm.castingDirectorName}
                          onChange={(event) =>
                            setProject('castingDirectorName', event.target.value)
                          }
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <TextField
                          label="Shooting location"
                          plainLabel
                          optional
                          placeholder="Los Angeles"
                          value={projectForm.shootingLocation}
                          onChange={(event) => setProject('shootingLocation', event.target.value)}
                        />
                        <TextField
                          label="Shoot starts"
                          plainLabel
                          optional
                          type="date"
                          value={projectForm.shootingStart}
                          onChange={(event) => setProject('shootingStart', event.target.value)}
                        />
                        <TextField
                          label="Shoot ends"
                          plainLabel
                          optional
                          type="date"
                          value={projectForm.shootingEnd}
                          onChange={(event) => setProject('shootingEnd', event.target.value)}
                        />
                      </div>
                      <FormField label="Synopsis" htmlFor="edit-synopsis" plainLabel optional>
                        <TextArea
                          id="edit-synopsis"
                          rows={4}
                          value={projectForm.synopsis}
                          onChange={(event) => setProject('synopsis', event.target.value)}
                        />
                      </FormField>
                      <FormField
                        label="Director brief"
                        htmlFor="edit-director-brief"
                        plainLabel
                        optional
                      >
                        <TextArea
                          id="edit-director-brief"
                          rows={5}
                          placeholder="Tone, references, what the director is looking for."
                          value={projectForm.directorBrief}
                          onChange={(event) => setProject('directorBrief', event.target.value)}
                        />
                      </FormField>
                    </>
                  )}
                </section>
              )}

              {/* Visibilité */}
              <section className="flex flex-col gap-4">
                <SectionTitle icon={Lock} title="Who can see it" />
                <div className="grid gap-2 sm:grid-cols-3">
                  {VISIBILITIES.map(({ value, label, hint }) => (
                    <ChoiceCard
                      key={value}
                      active={form.visibility === value}
                      label={label}
                      hint={hint}
                      onClick={() => set('visibility', value)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Suppression, séparée du reste */}
          {mayDelete && (
            <div className="mt-10 border-t border-dashed border-line pt-6">
              <div className="overflow-hidden rounded-[22px] border border-signal-no/20 bg-gradient-to-br from-signal-no/[0.07] via-signal-no/[0.03] to-transparent">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal-no/10 text-signal-no">
                      <Trash2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-[16px] font-extrabold tracking-[-0.01em] text-ink">
                        Delete this casting
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug text-muted">
                        Gone for good, with everything attached to it.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Chip icon={Megaphone}>
                          {roleCount} {roleCount === 1 ? 'role' : 'roles'}
                        </Chip>
                        <Chip icon={Users}>
                          {applicantCount} {applicantCount === 1 ? 'application' : 'applications'}
                        </Chip>
                      </div>
                    </div>
                  </div>
                  {!confirming && (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-btn bg-card px-4 text-[13.5px] font-bold text-signal-no shadow-sm ring-1 ring-signal-no/30 transition-colors hover:bg-signal-no hover:text-white sm:self-center"
                    >
                      Delete casting
                    </button>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {confirming && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-4 border-t border-signal-no/15 bg-card/70 p-5">
                        <p className="text-[13.5px] leading-relaxed text-ink/85">
                          {applicantCount > 0
                            ? `${applicantCount} ${applicantCount === 1 ? 'talent has' : 'talents have'} applied. Their applications and self-tapes for this casting will be deleted too. To only stop new submissions, close the casting instead.`
                            : `“${casting.title}” and its ${roleCount} ${roleCount === 1 ? 'role' : 'roles'} will be deleted.`}
                        </p>
                        {mustType && (
                          <TextField
                            label={`Type “${casting.title}” to confirm`}
                            plainLabel
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            placeholder={casting.title}
                            autoFocus
                          />
                        )}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setConfirming(false)
                              setTyped('')
                            }}
                          >
                            Keep it
                          </Button>
                          <button
                            type="button"
                            disabled={!deleteReady || mutations.deleteCasting.isPending}
                            onClick={() => void remove()}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-btn bg-signal-no px-5 text-[13.5px] font-bold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                            {mutations.deleteCasting.isPending ? 'Deleting…' : 'Delete for good'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6 sm:py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Megaphone; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line pb-2">
      <Icon className="h-4 w-4 text-muted" />
      <h3 className="font-display text-[15px] font-extrabold tracking-[-0.01em] text-ink">
        {title}
      </h3>
    </div>
  )
}

function ChoiceCard({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-field border p-3 text-left transition-colors',
        active ? 'border-ink/30 bg-paper' : 'border-line hover:border-ink/20',
      )}
    >
      <span className="block text-[13.5px] font-bold text-ink">{label}</span>
      <span className="mt-0.5 block text-[12px] leading-snug text-muted">{hint}</span>
    </button>
  )
}

function Chip({ icon: Icon, children }: { icon: typeof Megaphone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold text-ink/75 ring-1 ring-line">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  )
}
