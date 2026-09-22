import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react'
import {
  Button,
  Card,
  FormError,
  FormField,
  Input,
  SelectInput,
  Spinner,
  Tag,
  TextField,
} from '@/components/ui'
import { TextArea } from '@/components/EditModal'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { MultiSelect } from '@/components/form/MultiSelect'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { can } from '@/lib/access'
import { useOrgProjects, useStudioMutations } from '@/features/studio/queries'
import { useLanguagesCatalog, useSkillsCatalog } from '@/features/talent/queries'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleInput } from '@/data/repositories/castings'

/**
 * Create a casting call — the production-side equivalent of the talent
 * onboarding: three steps, each one a real write.
 *
 *   1. the project (an existing one, or a new one created here)
 *   2. the casting call itself
 *   3. its roles, then publish
 *
 * Nothing is kept in local state beyond the current step: the project and the
 * casting are inserted as you go, so leaving mid-way leaves a real draft behind
 * rather than losing everything.
 */

const PRODUCTION_TYPES = [
  'Film',
  'TV series',
  'Short film',
  'Commercial',
  'Music video',
  'Theatre',
  'Reality TV',
  'Documentary',
  'Voice over',
]

export function NewCastingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const { organization, isLoading: orgLoading } = useCurrentOrganization(profile?.id)
  const projects = useOrgProjects(organization?.id)
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [castingId, setCastingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — project
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [project, setProject] = useState({
    title: '',
    productionType: 'Film',
    genre: '',
    companyName: organization?.name ?? '',
    directorName: '',
    shootingLocation: '',
    shootingStart: '',
    shootingEnd: '',
    synopsis: '',
    directorBrief: '',
  })

  // Step 2 — casting call
  const [casting, setCasting] = useState({
    title: '',
    description: '',
    location: '',
    deadlineAt: '',
    compensation: '',
  })

  // Step 3 — roles
  const [roles, setRoles] = useState<RoleInput[]>([])
  const [roleDraft, setRoleDraft] = useState<RoleInput>({ name: '', roleType: 'lead' })

  if (orgLoading) {
    return <Card className="h-40" />
  }

  if (organization && !can(organization.role, 'casting:create')) {
    return (
      <EmptyState
        title="Your role cannot open a casting"
        description={`You are ${organization.name}'s ${organization.role.replace('_', ' ')}. Ask an owner or a casting director to create it — you will still review the candidates.`}
        action={
          <Link
            to="/studio/casting-calls"
            className="inline-flex h-11 items-center rounded-field bg-ink px-5 text-[14px] font-bold text-white"
          >
            Back to castings
          </Link>
        }
      />
    )
  }

  if (!organization) {
    return (
      <EmptyState
        title="You need an organization first"
        description="Castings belong to a team."
        action={
          <Link
            to="/onboarding"
            className="inline-flex h-11 items-center rounded-field bg-ink px-5 text-[14px] font-bold text-white"
          >
            Set up my organization
          </Link>
        }
      />
    )
  }

  async function submitProject() {
    setError(null)
    try {
      if (mode === 'existing') {
        if (!projectId) {
          setError('Pick a project, or create a new one')
          return
        }
      } else {
        if (!project.title.trim()) {
          setError('Your project needs a title')
          return
        }
        const created = await mutations.createProject.mutateAsync({
          title: project.title,
          productionType: project.productionType,
          genre: project.genre || null,
          companyName: project.companyName || null,
          directorName: project.directorName || null,
          shootingLocation: project.shootingLocation || null,
          shootingStart: project.shootingStart || null,
          shootingEnd: project.shootingEnd || null,
          synopsis: project.synopsis || null,
          directorBrief: project.directorBrief || null,
          status: 'casting',
        })
        track('project_created', { project_id: created.id })
        setProjectId(created.id)
      }
      setStep(2)
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save the project'))
    }
  }

  async function submitCasting() {
    setError(null)
    if (!projectId) {
      setStep(1)
      return
    }
    if (!casting.title.trim()) {
      setError('Give this casting call a title')
      return
    }
    try {
      const created = await mutations.createCasting.mutateAsync({
        projectId,
        title: casting.title,
        description: casting.description || null,
        location: casting.location || null,
        deadlineAt: casting.deadlineAt ? new Date(casting.deadlineAt).toISOString() : null,
        compensation: casting.compensation || null,
      })
      track('casting_created', { casting_id: created.id })
      setCastingId(created.id)
      setStep(3)
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not create the casting call'))
    }
  }

  async function addRole() {
    setError(null)
    if (!castingId) return
    if (!roleDraft.name.trim()) {
      setError('A role needs a name')
      return
    }
    if (
      roleDraft.playingAgeMin != null &&
      roleDraft.playingAgeMax != null &&
      roleDraft.playingAgeMin > roleDraft.playingAgeMax
    ) {
      setError('The upper playing age must be greater than the lower one')
      return
    }
    try {
      await mutations.createRole.mutateAsync({
        castingId,
        input: { ...roleDraft, sortOrder: roles.length },
      })
      setRoles((current) => [...current, roleDraft])
      setRoleDraft({ name: '', roleType: 'supporting' })
      toast('Role added')
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not add the role'))
    }
  }

  async function publish() {
    setError(null)
    if (!castingId) return
    if (roles.length === 0) {
      setError('Add at least one role before publishing')
      return
    }
    try {
      await mutations.setCastingStatus.mutateAsync({ id: castingId, status: 'published' })
      track('casting_published', { casting_id: castingId })
      toast('Casting published — talents can apply now')
      navigate(`/studio/casting/${castingId}`)
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not publish the casting call'))
    }
  }

  const busy =
    mutations.createProject.isPending ||
    mutations.createCasting.isPending ||
    mutations.createRole.isPending ||
    mutations.setCastingStatus.isPending

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <button
          onClick={() => navigate('/studio/casting-calls')}
          className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-btn px-2 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Casting calls
        </button>
        <h1 className="mt-3 font-display text-[1.8rem] font-extrabold tracking-[-0.025em] text-ink sm:text-[2.2rem]">
          New casting
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Three steps: the project, the casting call, its roles. Published roles are visible to
          talents immediately.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {[1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-[3px] flex-1 rounded-full transition-colors',
              index <= step ? 'bg-ink' : 'bg-line',
            )}
          />
        ))}
      </div>

      {error && <FormError>{error}</FormError>}

      {/* ── Step 1 — project ── */}
      {step === 1 && (
        <Card className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[19px] font-bold text-ink">The project</h2>
            <SegmentedControl
              options={[
                { value: 'existing', label: 'Existing project' },
                { value: 'new', label: 'New project' },
              ]}
              value={mode}
              onChange={(value) => value && setMode(value as typeof mode)}
            />
          </div>

          {mode === 'existing' ? (
            projects.isLoading ? (
              <Card className="h-20" />
            ) : (projects.data?.length ?? 0) === 0 ? (
              <EmptyState
                compact
                title="No project yet"
                description="Create the project this casting belongs to."
                action={
                  <Button size="sm" onClick={() => setMode('new')}>
                    New project
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {(projects.data ?? []).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setProjectId(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-field border p-3 text-left transition-colors',
                        projectId === item.id
                          ? 'border-ink bg-paper'
                          : 'border-line hover:border-ink/30',
                      )}
                    >
                      <span className="h-12 w-10 shrink-0 overflow-hidden rounded-btn bg-line">
                        {item.poster_url && (
                          <img src={item.poster_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {[item.production_type, item.company_name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <Tag tone="neutral">{item.status}</Tag>
                      {projectId === item.id && <Check className="h-4 w-4 text-ink" />}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-4">
              <TextField
                label="Project title"
                plainLabel
                fieldSize="lg"
                placeholder="Les Ombres de Midi"
                value={project.title}
                onChange={(event) =>
                  setProject((current) => ({ ...current, title: event.target.value }))
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Production type" htmlFor="production-type" plainLabel>
                  <SelectInput
                    id="production-type"
                    fieldSize="lg"
                    value={project.productionType}
                    onChange={(event) =>
                      setProject((current) => ({ ...current, productionType: event.target.value }))
                    }
                  >
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
                  fieldSize="lg"
                  placeholder="Psychological thriller"
                  value={project.genre}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, genre: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Production company"
                  plainLabel
                  optional
                  fieldSize="lg"
                  value={project.companyName}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, companyName: event.target.value }))
                  }
                />
                <TextField
                  label="Director"
                  plainLabel
                  optional
                  fieldSize="lg"
                  value={project.directorName}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, directorName: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Shooting location"
                  plainLabel
                  optional
                  fieldSize="lg"
                  placeholder="Marseille"
                  value={project.shootingLocation}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, shootingLocation: event.target.value }))
                  }
                />
                <TextField
                  label="Shoot starts"
                  plainLabel
                  optional
                  fieldSize="lg"
                  type="date"
                  value={project.shootingStart}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, shootingStart: event.target.value }))
                  }
                />
                <TextField
                  label="Shoot ends"
                  plainLabel
                  optional
                  fieldSize="lg"
                  type="date"
                  value={project.shootingEnd}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, shootingEnd: event.target.value }))
                  }
                />
              </div>

              <FormField label="Synopsis" htmlFor="synopsis" plainLabel optional>
                <TextArea
                  id="synopsis"
                  rows={3}
                  value={project.synopsis}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, synopsis: event.target.value }))
                  }
                />
              </FormField>

              <FormField label="Director’s brief" htmlFor="brief" plainLabel optional>
                <TextArea
                  id="brief"
                  rows={3}
                  placeholder="What you are looking for, in the director’s words."
                  value={project.directorBrief}
                  onChange={(event) =>
                    setProject((current) => ({ ...current, directorBrief: event.target.value }))
                  }
                />
              </FormField>
            </div>
          )}

          <div className="flex justify-end border-t border-line pt-5">
            <button
              type="button"
              onClick={submitProject}
              disabled={busy}
              className="inline-flex h-13 items-center gap-2.5 rounded-field bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {busy && <Spinner className="h-[18px] w-[18px]" />}
              Continue
              {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </Card>
      )}

      {/* ── Step 2 — casting call ── */}
      {step === 2 && (
        <Card className="flex flex-col gap-5">
          <h2 className="font-display text-[19px] font-bold text-ink">The casting call</h2>

          <TextField
            label="Casting title"
            plainLabel
            fieldSize="lg"
            placeholder="Les Ombres de Midi — main cast"
            value={casting.title}
            onChange={(event) =>
              setCasting((current) => ({ ...current, title: event.target.value }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Auditions location"
              plainLabel
              optional
              fieldSize="lg"
              placeholder="Marseille"
              value={casting.location}
              onChange={(event) =>
                setCasting((current) => ({ ...current, location: event.target.value }))
              }
            />
            <TextField
              label="Submissions close"
              plainLabel
              optional
              fieldSize="lg"
              type="date"
              value={casting.deadlineAt}
              onChange={(event) =>
                setCasting((current) => ({ ...current, deadlineAt: event.target.value }))
              }
            />
          </div>

          <TextField
            label="Compensation"
            plainLabel
            optional
            fieldSize="lg"
            placeholder="SAG scale + 10%"
            value={casting.compensation}
            onChange={(event) =>
              setCasting((current) => ({ ...current, compensation: event.target.value }))
            }
          />

          <FormField label="Description" htmlFor="casting-description" plainLabel optional>
            <TextArea
              id="casting-description"
              rows={3}
              placeholder="What talents should know before applying."
              value={casting.description}
              onChange={(event) =>
                setCasting((current) => ({ ...current, description: event.target.value }))
              }
            />
          </FormField>

          <div className="flex items-center justify-between border-t border-line pt-5">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Back
            </Button>
            <button
              type="button"
              onClick={submitCasting}
              disabled={busy}
              className="inline-flex h-13 items-center gap-2.5 rounded-field bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {busy && <Spinner className="h-[18px] w-[18px]" />}
              Create and add roles
              {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </Card>
      )}

      {/* ── Step 3 — roles ── */}
      {step === 3 && castingId && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-[19px] font-bold text-ink">Roles</h2>
              <p className="mt-1 text-[14px] text-muted">
                The criteria you set here are what talents read — and what the search matches on.
              </p>
            </div>

            {roles.length > 0 && (
              <ul className="flex flex-col divide-y divide-line">
                {roles.map((role, index) => (
                  <li key={`${role.name}-${index}`} className="flex items-center gap-3 py-3">
                    <Check className="h-4 w-4 shrink-0 text-signal-good" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-ink">
                        {role.name}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {[
                          role.roleType,
                          role.playingAgeMin && role.playingAgeMax
                            ? `${role.playingAgeMin}–${role.playingAgeMax}`
                            : null,
                          role.genderPref,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <RoleForm
              draft={roleDraft}
              onChange={setRoleDraft}
              onAdd={addRole}
              busy={mutations.createRole.isPending}
            />
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to={`/studio/casting/${castingId}`}
              className="text-[14px] font-semibold text-muted hover:text-ink"
            >
              Save as draft and finish later
            </Link>
            <button
              type="button"
              onClick={publish}
              disabled={busy || roles.length === 0}
              className="inline-flex h-13 items-center gap-2.5 rounded-field bg-ink px-7 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {busy && <Spinner className="h-[18px] w-[18px]" />}
              Publish casting
              {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The role editor, shared by the creation flow and the casting detail. */
export function RoleForm({
  draft,
  onChange,
  onAdd,
  onCancel,
  busy,
  submitLabel = 'Add this role',
}: {
  draft: RoleInput
  onChange: (draft: RoleInput) => void
  onAdd: () => void
  onCancel?: () => void
  busy?: boolean
  submitLabel?: string
}) {
  const languages = useLanguagesCatalog()
  const skills = useSkillsCatalog()

  const set = <K extends keyof RoleInput>(key: K, value: RoleInput[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className="flex flex-col gap-4 rounded-field bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <TextField
          label="Role name"
          plainLabel
          fieldSize="lg"
          placeholder="Inspectrice Chloé Marchand"
          value={draft.name}
          onChange={(event) => set('name', event.target.value)}
        />
        <FormField label="Type" plainLabel>
          <SegmentedControl
            variant="pills"
            options={[
              { value: 'lead', label: 'Lead' },
              { value: 'supporting', label: 'Supporting' },
              { value: 'contestant', label: 'Contestant' },
            ]}
            value={draft.roleType ?? 'supporting'}
            onChange={(value) => value && set('roleType', value as RoleInput['roleType'])}
          />
        </FormField>
      </div>

      <FormField label="Description" htmlFor="role-description" plainLabel optional>
        <TextArea
          id="role-description"
          rows={2}
          placeholder="Who this character is, in two lines."
          value={draft.description ?? ''}
          onChange={(event) => set('description', event.target.value)}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-4">
        <FormField label="Age from" htmlFor="role-age-from" plainLabel optional>
          <Input
            id="role-age-from"
            fieldSize="lg"
            type="number"
            min={0}
            max={120}
            value={draft.playingAgeMin ?? ''}
            onChange={(event) =>
              set('playingAgeMin', event.target.value ? Number(event.target.value) : null)
            }
          />
        </FormField>
        <FormField label="Age to" htmlFor="role-age-to" plainLabel optional>
          <Input
            id="role-age-to"
            fieldSize="lg"
            type="number"
            min={0}
            max={120}
            value={draft.playingAgeMax ?? ''}
            onChange={(event) =>
              set('playingAgeMax', event.target.value ? Number(event.target.value) : null)
            }
          />
        </FormField>
        <FormField label="Gender" htmlFor="role-gender" plainLabel optional>
          <SelectInput
            id="role-gender"
            fieldSize="lg"
            value={draft.genderPref ?? ''}
            onChange={(event) => set('genderPref', event.target.value || null)}
          >
            <option value="">Any</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Non-binary">Non-binary</option>
          </SelectInput>
        </FormField>
        <TextField
          label="Location"
          plainLabel
          optional
          fieldSize="lg"
          value={draft.location ?? ''}
          onChange={(event) => set('location', event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Languages" htmlFor="role-languages" plainLabel optional>
          <MultiSelect
            inputId="role-languages"
            fieldSize="lg"
            options={(languages.data ?? []).map((language) => ({
              value: language.code,
              label: language.name,
            }))}
            values={draft.languages ?? []}
            onChange={(values) => set('languages', values)}
            placeholder="Search a language…"
          />
        </FormField>
        <FormField label="Skills" htmlFor="role-skills" plainLabel optional>
          <MultiSelect
            inputId="role-skills"
            fieldSize="lg"
            options={(skills.data ?? []).map((skill) => ({
              value: skill.name,
              label: skill.name,
            }))}
            values={draft.skills ?? []}
            onChange={(values) => set('skills', values)}
            allowCreate
            placeholder="Search or add a skill…"
          />
        </FormField>
      </div>

      <FormField label="Self-tape instructions" htmlFor="role-selftape" plainLabel optional>
        <TextArea
          id="role-selftape"
          rows={2}
          placeholder="Scene 12, in French. Chest shot, natural light, one take."
          value={draft.selftapeInstructions ?? ''}
          onChange={(event) => set('selftapeInstructions', event.target.value)}
        />
      </FormField>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={onAdd}
          disabled={busy}
          icon={busy ? <Spinner /> : <Plus className="h-4 w-4" />}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
