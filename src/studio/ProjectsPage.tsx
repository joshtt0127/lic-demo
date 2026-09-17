import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, FolderOpen, MapPin, Pencil, Plus, Upload } from 'lucide-react'
import {
  Button,
  Card,
  FormError,
  FormField,
  SelectInput,
  Spinner,
  Tag,
  TextField,
} from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization } from '@/features/organizations/queries'
import { useOrgCastings, useOrgProjects, useStudioMutations } from '@/features/studio/queries'
import { useMediaMutations } from '@/features/talent/queries'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { ProjectRow, ProjectStatus } from '@/types/database'
import type { ProjectInput } from '@/data/repositories/castings'

/** The organization's projects — real rows, with their castings and artwork. */

const STATUSES: ProjectStatus[] = [
  'draft',
  'casting',
  'callbacks',
  'pre_production',
  'cast',
  'archived',
]

const PRODUCTION_TYPES = [
  'Film',
  'TV series',
  'Short film',
  'Commercial',
  'Music video',
  'Theatre',
  'Reality TV',
  'Documentary',
]

export function ProjectsPage() {
  const { profile } = useAuth()
  const { organization } = useCurrentOrganization(profile?.id)
  const projects = useOrgProjects(organization?.id)
  const castings = useOrgCastings(organization?.id)
  const mutations = useStudioMutations(organization?.id, profile?.id)

  const [editing, setEditing] = useState<ProjectRow | 'new' | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
            Projects
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {projects.isLoading
              ? 'Loading…'
              : `${projects.data?.length ?? 0} project${(projects.data?.length ?? 0) === 1 ? '' : 's'} in ${organization?.name ?? 'your organization'}`}
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New project
        </Button>
      </header>

      {projects.error && (
        <FormError>{errorMessage(projects.error, 'Could not load your projects')}</FormError>
      )}

      {projects.isLoading ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="No project yet"
          description="A project holds your castings, roles and candidates."
          action={<Button onClick={() => setEditing('new')}>New project</Button>}
        />
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          {(projects.data ?? []).map((project) => {
            const own = (castings.data ?? []).filter((casting) => casting.project_id === project.id)
            const roles = own.reduce((total, casting) => total + casting.roles.length, 0)

            return (
              <li key={project.id}>
                <Card flush className="flex h-full flex-col overflow-hidden">
                  <div className="flex gap-4 p-4">
                    <span className="h-24 w-[68px] shrink-0 overflow-hidden rounded-btn bg-line">
                      {project.poster_url && (
                        <img
                          src={project.poster_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-display text-[17px] font-bold text-ink">
                            {project.title}
                          </span>
                          <span className="block truncate text-[13px] text-muted">
                            {[project.production_type, project.genre, project.company_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <button
                          onClick={() => setEditing(project)}
                          aria-label={`Edit ${project.title}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Tag tone={project.status === 'casting' ? 'good' : 'neutral'}>
                          {project.status.replace('_', ' ')}
                        </Tag>
                        <Tag>
                          {own.length} casting{own.length === 1 ? '' : 's'}
                        </Tag>
                        <Tag>
                          {roles} role{roles === 1 ? '' : 's'}
                        </Tag>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                        {project.shooting_location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {project.shooting_location}
                          </span>
                        )}
                        {project.shooting_start && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(project.shooting_start)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {own.length > 0 && (
                    <ul className="mt-auto flex flex-col divide-y divide-line border-t border-line">
                      {own.map((casting) => (
                        <li key={casting.id}>
                          <Link
                            to={`/studio/casting/${casting.id}`}
                            className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-paper"
                          >
                            <span className="min-w-0 truncate text-ink">{casting.title}</span>
                            <Tag tone={casting.status === 'published' ? 'good' : 'neutral'}>
                              {casting.status}
                            </Tag>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <ProjectModal
          project={editing === 'new' ? null : editing}
          pending={mutations.createProject.isPending || mutations.updateProject.isPending}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === 'new') {
              await mutations.createProject.mutateAsync(input)
            } else {
              await mutations.updateProject.mutateAsync({ id: editing.id, input })
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ProjectModal({
  project,
  pending,
  onClose,
  onSave,
}: {
  project: ProjectRow | null
  pending: boolean
  onClose: () => void
  onSave: (input: ProjectInput) => Promise<void>
}) {
  const toast = useToast()
  const { profile } = useAuth()
  const media = useMediaMutations(profile?.id)

  const [form, setForm] = useState({
    title: project?.title ?? '',
    productionType: project?.production_type ?? 'Film',
    genre: project?.genre ?? '',
    companyName: project?.company_name ?? '',
    directorName: project?.director_name ?? '',
    shootingLocation: project?.shooting_location ?? '',
    shootingStart: project?.shooting_start ?? '',
    shootingEnd: project?.shooting_end ?? '',
    synopsis: project?.synopsis ?? '',
    directorBrief: project?.director_brief ?? '',
    status: project?.status ?? ('casting' as ProjectStatus),
    posterUrl: project?.poster_url ?? null as string | null,
  })
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function uploadPoster(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'poster', file, onProgress: setPercent })
      setForm((current) => ({ ...current, posterUrl: asset.url }))
      toast('Artwork uploaded')
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload the artwork'))
    } finally {
      setPercent(null)
    }
  }

  return (
    <EditModal
      open
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      saveLabel={pending ? 'Saving…' : 'Save project'}
      onSave={async () => {
        if (!form.title.trim()) {
          setError('Your project needs a title')
          return
        }
        setError(null)
        try {
          await onSave({
            title: form.title,
            productionType: form.productionType || null,
            genre: form.genre || null,
            companyName: form.companyName || null,
            directorName: form.directorName || null,
            shootingLocation: form.shootingLocation || null,
            shootingStart: form.shootingStart || null,
            shootingEnd: form.shootingEnd || null,
            synopsis: form.synopsis || null,
            directorBrief: form.directorBrief || null,
            status: form.status,
            posterUrl: form.posterUrl,
          })
        } catch (saveError) {
          setError(errorMessage(saveError, 'Could not save the project'))
        }
      }}
    >
      {error && <FormError>{error}</FormError>}

      <FormField label="Artwork" plainLabel>
        <div className="flex items-center gap-4">
          <span className="h-24 w-[68px] shrink-0 overflow-hidden rounded-btn bg-line">
            {form.posterUrl && (
              <img src={form.posterUrl} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <FileDropzone kind="poster" onFile={uploadPoster} onError={setError} bare className="flex-1">
            <span className="flex w-full flex-col items-center gap-1 rounded-field bg-[#F1F0EB] px-4 py-4 transition-colors hover:bg-[#EAE8E2]">
              <span className="inline-flex items-center gap-2 text-[14px] font-bold text-ink">
                {percent !== null ? <Spinner /> : <Upload className="h-4 w-4" />}
                {form.posterUrl ? 'Replace artwork' : 'Upload artwork'}
              </span>
              <span className="text-[12px] text-muted">JPG, PNG · up to 20 MB</span>
            </span>
          </FileDropzone>
        </div>
        {percent !== null && <UploadProgress percent={percent} />}
      </FormField>

      <TextField
        label="Title"
        plainLabel
        value={form.title}
        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Type" plainLabel>
          <SelectInput
            value={form.productionType}
            onChange={(event) =>
              setForm((current) => ({ ...current, productionType: event.target.value }))
            }
          >
            {PRODUCTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Status" plainLabel>
          <SelectInput
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))
            }
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </SelectInput>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Genre"
          plainLabel
          optional
          value={form.genre}
          onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))}
        />
        <TextField
          label="Company"
          plainLabel
          optional
          value={form.companyName}
          onChange={(event) =>
            setForm((current) => ({ ...current, companyName: event.target.value }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Director"
          plainLabel
          optional
          value={form.directorName}
          onChange={(event) =>
            setForm((current) => ({ ...current, directorName: event.target.value }))
          }
        />
        <TextField
          label="Shooting location"
          plainLabel
          optional
          value={form.shootingLocation}
          onChange={(event) =>
            setForm((current) => ({ ...current, shootingLocation: event.target.value }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Shoot starts"
          plainLabel
          optional
          type="date"
          value={form.shootingStart ?? ''}
          onChange={(event) =>
            setForm((current) => ({ ...current, shootingStart: event.target.value }))
          }
        />
        <TextField
          label="Shoot ends"
          plainLabel
          optional
          type="date"
          value={form.shootingEnd ?? ''}
          onChange={(event) =>
            setForm((current) => ({ ...current, shootingEnd: event.target.value }))
          }
        />
      </div>

      <Field label="Synopsis">
        <TextArea
          rows={3}
          value={form.synopsis}
          onChange={(event) => setForm((current) => ({ ...current, synopsis: event.target.value }))}
        />
      </Field>

      <Field label="Director’s brief">
        <TextArea
          rows={3}
          value={form.directorBrief}
          onChange={(event) =>
            setForm((current) => ({ ...current, directorBrief: event.target.value }))
          }
        />
      </Field>
    </EditModal>
  )
}
