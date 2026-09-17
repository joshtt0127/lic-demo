import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase,
  Camera,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserCircle2,
  Video,
  Zap,
} from 'lucide-react'
import { Avatar, Button, Card, FormError, Spinner, Tag } from '@/components/ui'
import { EditModal, Field, Select, TextArea, TextInput } from '@/components/EditModal'
import { Skeleton } from '@/components/Skeleton'
import { MultiSelect } from '@/components/form/MultiSelect'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import { MediaGallery } from '@/components/upload/MediaGallery'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  ETHNICITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  GENDER_OPTIONS,
} from '@/pages/onboarding/talent/CastingProfileStep'
import { profileCompletion } from '@/features/talent/completion'
import {
  useCreditMutations,
  useLanguagesCatalog,
  useMediaMutations,
  useSetTalentLanguages,
  useSkillsCatalog,
  useTalentProfile,
  useTalentSkillMutations,
  useTrainingMutations,
  useUpdateAccountProfile,
  useUpdateTalentProfile,
  type TalentProfileFull,
} from '@/features/talent/queries'
import { useTalentApplicationStats } from '@/features/applications/queries'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/supabase'
import type { CreditRow, TrainingRow } from '@/types/database'

/**
 * Talent profile — LinkedIn-style, casting-industry oriented.
 *
 * Every section reads from Postgres and every edit writes to it: nothing here
 * lives in React state beyond the open modal and its draft. Reload, sign out,
 * come back on another device — the profile is the same.
 */
export function TalentProfilePage() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useTalentProfile(profile?.id)

  if (isLoading || (!data && !error)) return <ProfileSkeleton />
  if (!data) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <FormError>{errorMessage(error, 'Could not load your profile')}</FormError>
      </div>
    )
  }

  return <ProfileView key={data.profile.id} data={data} />
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5 pb-16 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex flex-1 flex-col gap-5">
        <Card flush className="overflow-hidden">
          <Skeleton className="h-40 w-full rounded-none" />
          <div className="px-5 pb-5 pt-14">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-32" />
        <Skeleton className="h-52" />
      </div>
      <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
        <Skeleton className="h-28" />
        <Skeleton className="h-24" />
      </div>
    </div>
  )
}

function ProfileView({ data }: { data: TalentProfileFull }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const profileId = data.profile.id

  const updateAccount = useUpdateAccountProfile(profileId)
  const updateTalent = useUpdateTalentProfile(profileId)
  const skills = useTalentSkillMutations(profileId)
  const credits = useCreditMutations(profileId)
  const training = useTrainingMutations(profileId)
  const setLanguages = useSetTalentLanguages(profileId)
  const skillsCatalogue = useSkillsCatalog()
  const languagesCatalogue = useLanguagesCatalog()
  const stats = useTalentApplicationStats(profileId)

  const [openSection, setOpenSection] = useState<
    'identity' | 'about' | 'appearance' | 'representation' | 'details' | 'languages' | null
  >(null)
  const [creditDraft, setCreditDraft] = useState<Partial<CreditRow> | null>(null)
  const [trainingDraft, setTrainingDraft] = useState<Partial<TrainingRow> | null>(null)
  const [newSkill, setNewSkill] = useState('')
  const [sectionError, setSectionError] = useState<string | null>(null)

  const completion = profileCompletion(data)
  const fullName =
    [data.profile.first_name, data.profile.last_name].filter(Boolean).join(' ') || 'Your profile'
  const displayedName = data.talent.professional_name || fullName

  const headshots = data.media.filter(
    (asset) => asset.kind === 'headshot' || asset.kind === 'portfolio',
  )
  const showreels = data.media.filter((asset) => asset.kind === 'showreel')

  /** Runs a mutation, surfaces the error instead of silently doing nothing. */
  async function run(action: () => Promise<unknown>, successMessage: string) {
    setSectionError(null)
    try {
      await action()
      track('profile_updated')
      toast(successMessage)
      return true
    } catch (mutationError) {
      setSectionError(errorMessage(mutationError, 'Could not save your change'))
      return false
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-16 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex flex-1 flex-col gap-5">
        {sectionError && <FormError>{sectionError}</FormError>}

        {/* ── identity ── */}
        <Card flush className="overflow-hidden">
          <CoverImage data={data} />

          <div className="relative px-5 pb-5 pt-14">
            <div className="absolute -top-12 left-5">
              <AvatarWithUpload data={data} name={displayedName} />
            </div>

            <button
              onClick={() => setOpenSection('identity')}
              aria-label="Edit profile"
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <h1 className="text-2xl font-bold tracking-tight text-ink">{displayedName}</h1>
            <p className="mt-1 text-sm text-muted">
              {data.talent.headline || 'Add a headline so productions know what you do.'}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {[data.profile.city, data.profile.country].filter(Boolean).join(', ') ||
                'Location not set'}
              {data.talent.agency_name ? ` · ${data.talent.agency_name}` : ''}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.talent.union_name && <Tag>{data.talent.union_name}</Tag>}
              <Tag tone={data.talent.availability === 'available' ? 'good' : 'neutral'}>
                {AVAILABILITY_LABEL[data.talent.availability]}
              </Tag>
              {data.talent.experience_level && <Tag tone="cream">{data.talent.experience_level}</Tag>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="premium"
                icon={<Zap className="h-3.5 w-3.5" />}
                onClick={() => navigate('/talent/casting-calls')}
              >
                Find casting calls
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpenSection('identity')}>
                Edit profile
              </Button>
            </div>
          </div>
        </Card>

        {/* ── stats (real counts) ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCell
            value={stats.data?.submitted ?? 0}
            label="Auditions sent"
            loading={stats.isLoading}
          />
          <StatCell
            value={stats.data?.shortlisted ?? 0}
            label="Shortlisted"
            loading={stats.isLoading}
          />
          <StatCell value={stats.data?.booked ?? 0} label="Booked" loading={stats.isLoading} />
        </div>

        {/* ── about ── */}
        <Card className="flex flex-col gap-2">
          <SectionHeader title="About" onEdit={() => setOpenSection('about')} />
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">
            {data.talent.bio || 'Add a short bio to introduce yourself to casting directors.'}
          </p>
        </Card>

        {/* ── profile strength ── */}
        <Card flush className="overflow-hidden bg-ink p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-label font-semibold uppercase tracking-label text-white/55">
                Profile strength
              </span>
              <p className="mt-1 text-sm text-white/80">
                {completion.percent === 100
                  ? 'Your profile is complete — productions see everything.'
                  : `${completion.missing.length} thing${completion.missing.length > 1 ? 's' : ''} left to stand out in search.`}
              </p>
            </div>
            <span className="font-mono text-2xl font-bold">{completion.percent}%</span>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${completion.percent}%` }}
            />
          </div>

          {completion.missing.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {completion.missing.slice(0, 5).map((item) => (
                <li
                  key={item.key}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── skills ── */}
        <Card className="flex flex-col gap-3">
          <SectionHeader title="Skills" />
          <p className="text-xs text-muted">
            Click the dots to set your proficiency level for each skill.
          </p>

          {data.skills.length === 0 ? (
            <p className="text-sm text-muted">
              No skills yet. Three or more makes your profile far easier to find.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.skills.map((skill) => (
                <li
                  key={skill.skillId}
                  className="group flex items-center justify-between gap-3 py-2 first:pt-0"
                >
                  <span className="text-sm font-medium text-ink">{skill.name}</span>
                  <div className="flex items-center gap-3">
                    <SkillDots
                      level={skill.level}
                      onSet={(level) =>
                        void run(
                          () => skills.setLevel.mutateAsync({ skillId: skill.skillId, level }),
                          'Skill level updated',
                        )
                      }
                    />
                    <button
                      onClick={() =>
                        void run(() => skills.remove.mutateAsync(skill.skillId), 'Skill removed')
                      }
                      aria-label={`Remove ${skill.name}`}
                      className="text-muted/50 opacity-0 transition-opacity hover:text-signal-no group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <TextInput
              value={newSkill}
              onChange={(event) => setNewSkill(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !newSkill.trim()) return
                void run(() => skills.add.mutateAsync({ name: newSkill.trim() }), 'Skill added').then(
                  (ok) => ok && setNewSkill(''),
                )
              }}
              list="skills-catalogue"
              placeholder="Search for a skill to add, e.g. Stage combat"
              className="flex-1"
            />
            <datalist id="skills-catalogue">
              {(skillsCatalogue.data ?? []).map((skill) => (
                <option key={skill.id} value={skill.name} />
              ))}
            </datalist>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={!newSkill.trim() || skills.add.isPending}
              onClick={() =>
                void run(() => skills.add.mutateAsync({ name: newSkill.trim() }), 'Skill added').then(
                  (ok) => ok && setNewSkill(''),
                )
              }
            >
              Add
            </Button>
          </div>
        </Card>

        {/* ── appearance / casting details ── */}
        <Card className="flex flex-col gap-2">
          <SectionHeader
            title="Appearance & casting details"
            icon={<UserCircle2 className="h-4 w-4" />}
            onEdit={() => setOpenSection('appearance')}
          />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Detail label="Gender" value={data.talent.gender} />
            <Detail
              label="Playing age"
              value={
                data.talent.playing_age_min !== null && data.talent.playing_age_max !== null
                  ? `${data.talent.playing_age_min}–${data.talent.playing_age_max}`
                  : null
              }
            />
            <Detail
              label="Height"
              value={data.talent.height_cm ? `${data.talent.height_cm} cm` : null}
            />
            <TagDetail label="Ethnicities" values={data.talent.ethnicities} />
            <TagDetail label="Accents" values={data.talent.accents} />
            <TagDetail label="Nationalities" values={data.talent.nationalities} />
          </div>
        </Card>

        {/* ── experience ── */}
        <Card className="flex flex-col gap-3">
          <SectionHeader
            title="Experience"
            icon={<Briefcase className="h-4 w-4" />}
            onAdd={() => setCreditDraft({ category: 'Film' })}
          />
          {data.credits.length === 0 ? (
            <p className="py-2 text-sm text-muted">No experience added yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.credits.map((credit) => (
                <li
                  key={credit.id}
                  className="group flex items-start justify-between gap-3 py-3 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {credit.role_name || 'Role'} ·{' '}
                      <span className="text-muted">{credit.title}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {[credit.category, credit.year, credit.company].filter(Boolean).join(' · ')}
                      {credit.director ? ` · dir. ${credit.director}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                      {credit.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {credit.location}
                        </span>
                      )}
                      {credit.url && (
                        <a
                          href={credit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-link hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          {credit.url.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  </div>
                  <RowActions
                    onEdit={() => setCreditDraft(credit)}
                    onDelete={() =>
                      void run(() => credits.remove.mutateAsync(credit.id), 'Experience removed')
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── photos & book ── */}
        <Card className="flex flex-col gap-3">
          <SectionHeader title="Photos & book" icon={<ImageIcon className="h-4 w-4" />} />
          <MediaGallery
            profileId={profileId}
            kind="headshot"
            assets={headshots}
            addLabel="Add photo"
            emptyHint="Headshots and book photos — JPG, PNG, WebP or AVIF up to 20 MB each."
          />
        </Card>

        {/* ── showreels ── */}
        <Card className="flex flex-col gap-3">
          <SectionHeader title="Showreels" icon={<Video className="h-4 w-4" />} />
          <MediaGallery
            profileId={profileId}
            kind="showreel"
            assets={showreels}
            aspect="video"
            addLabel="Add showreel"
            emptyHint="MP4, MOV or WebM up to 200 MB. Self-tapes you submit stay private to that casting."
          />
        </Card>

        {/* ── training ── */}
        <Card className="flex flex-col gap-3">
          <SectionHeader
            title="Training & education"
            icon={<GraduationCap className="h-4 w-4" />}
            onAdd={() => setTrainingDraft({})}
          />
          {data.training.length === 0 ? (
            <p className="text-sm text-muted">No training added yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.training.map((entry) => (
                <li
                  key={entry.id}
                  className="group flex items-start justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="text-sm">
                    <p className="font-semibold text-ink">{entry.school}</p>
                    <p className="text-xs text-muted">
                      {[entry.program, [entry.start_year, entry.end_year].filter(Boolean).join('–')]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {entry.description && (
                      <p className="mt-1 text-xs text-muted">{entry.description}</p>
                    )}
                  </div>
                  <RowActions
                    onEdit={() => setTrainingDraft(entry)}
                    onDelete={() =>
                      void run(() => training.remove.mutateAsync(entry.id), 'Training removed')
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── sidebar ── */}
      <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
        <Card className="flex flex-col gap-2">
          <SectionHeader title="Representation" onEdit={() => setOpenSection('representation')} />
          {data.talent.agency_name || data.talent.agent_name ? (
            <div className="text-sm">
              {data.talent.agency_name && (
                <p className="font-semibold text-ink">{data.talent.agency_name}</p>
              )}
              {data.talent.agent_name && <p className="text-muted">{data.talent.agent_name}</p>}
              {data.talent.agent_email && (
                <a
                  href={`mailto:${data.talent.agent_email}`}
                  className="mt-1 block font-medium text-link hover:underline"
                >
                  {data.talent.agent_email}
                </a>
              )}
              {data.talent.agent_phone && <p className="text-muted">{data.talent.agent_phone}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">No agent on file.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-2">
          <SectionHeader title="Languages" onEdit={() => setOpenSection('languages')} />
          {data.languages.length === 0 ? (
            <p className="text-sm text-muted">No language added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.languages.map((language) => (
                <Tag key={language.code}>{language.name}</Tag>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-2 text-sm">
          <SectionHeader title="Details" onEdit={() => setOpenSection('details')} />
          <InfoRow
            label="Height"
            value={data.talent.height_cm ? `${data.talent.height_cm} cm` : '—'}
          />
          <InfoRow label="Availability" value={AVAILABILITY_LABEL[data.talent.availability]} />
          <InfoRow label="Contact" value={user?.email ?? '—'} link />
          {data.talent.website && (
            <InfoRow label="Website" value={data.talent.website.replace(/^https?:\/\//, '')} link />
          )}
        </Card>
      </div>

      {/* ── modals ── */}
      {openSection === 'identity' && (
      <IdentityModal
        open
        data={data}
        onClose={() => setOpenSection(null)}
        onSave={async (patch) => {
          const ok = await run(async () => {
            await updateAccount.mutateAsync(patch.account)
            await updateTalent.mutateAsync(patch.talent)
          }, 'Profile updated')
          if (ok) setOpenSection(null)
        }}
        pending={updateAccount.isPending || updateTalent.isPending}
      />
      )}

      {openSection === 'about' && (
      <AboutModal
        open
        bio={data.talent.bio ?? ''}
        onClose={() => setOpenSection(null)}
        onSave={async (bio) => {
          const ok = await run(() => updateTalent.mutateAsync({ bio: bio || null }), 'Bio updated')
          if (ok) setOpenSection(null)
        }}
      />
      )}

      {openSection === 'appearance' && (
      <AppearanceModal
        open
        data={data}
        onClose={() => setOpenSection(null)}
        onSave={async (patch) => {
          const ok = await run(() => updateTalent.mutateAsync(patch), 'Casting details updated')
          if (ok) setOpenSection(null)
        }}
      />
      )}

      {openSection === 'representation' && (
      <RepresentationModal
        open
        data={data}
        onClose={() => setOpenSection(null)}
        onSave={async (patch) => {
          const ok = await run(() => updateTalent.mutateAsync(patch), 'Representation updated')
          if (ok) setOpenSection(null)
        }}
      />
      )}

      {openSection === 'details' && (
      <DetailsModal
        open
        data={data}
        onClose={() => setOpenSection(null)}
        onSave={async (patch) => {
          const ok = await run(() => updateTalent.mutateAsync(patch), 'Details updated')
          if (ok) setOpenSection(null)
        }}
      />
      )}

      {openSection === 'languages' && (
      <LanguagesModal
        open
        selected={data.languages.map((language) => language.code)}
        options={(languagesCatalogue.data ?? []).map((language) => ({
          value: language.code,
          label: language.name,
        }))}
        onClose={() => setOpenSection(null)}
        onSave={async (codes) => {
          const ok = await run(() => setLanguages.mutateAsync(codes), 'Languages updated')
          if (ok) setOpenSection(null)
        }}
      />
      )}

      {creditDraft && (
      <CreditModal
        draft={creditDraft}
        onClose={() => setCreditDraft(null)}
        onSave={async (values) => {
          const ok = await run(async () => {
            if (creditDraft?.id) {
              await credits.update.mutateAsync({ id: creditDraft.id, patch: values })
            } else {
              await credits.create.mutateAsync({ ...values, sort_order: data.credits.length })
            }
          }, 'Experience saved')
          if (ok) setCreditDraft(null)
        }}
      />
      )}

      {trainingDraft && (
      <TrainingModal
        draft={trainingDraft}
        onClose={() => setTrainingDraft(null)}
        onSave={async (values) => {
          const ok = await run(async () => {
            if (trainingDraft?.id) {
              await training.update.mutateAsync({ id: trainingDraft.id, patch: values })
            } else {
              await training.create.mutateAsync({ ...values, sort_order: data.training.length })
            }
          }, 'Training saved')
          if (ok) setTrainingDraft(null)
        }}
      />
      )}
    </div>
  )
}

const AVAILABILITY_LABEL = {
  available: 'Available',
  on_project: 'On project',
  unavailable: 'Unavailable',
} as const

// ── Cover & avatar ───────────────────────────────────────────────────────────

function CoverImage({ data }: { data: TalentProfileFull }) {
  const media = useMediaMutations(data.profile.id)
  const updateTalent = useUpdateTalentProfile(data.profile.id)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'cover', file, onProgress: setPercent })
      await updateTalent.mutateAsync({ cover_url: asset.url })
      track('media_uploaded', { kind: 'cover' })
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload the cover'))
    } finally {
      setPercent(null)
    }
  }

  return (
    <div className="group relative h-40 w-full bg-line">
      {data.talent.cover_url && (
        <img src={data.talent.cover_url} alt="" className="h-full w-full object-cover" />
      )}

      <FileDropzone
        kind="cover"
        onFile={handleFile}
        onError={setError}
        disabled={percent !== null}
        bare
        className="absolute right-3 top-3 z-10"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-ink shadow-card">
          {percent !== null ? <Spinner className="h-3.5 w-3.5" /> : <Camera className="h-4 w-4" />}
        </span>
      </FileDropzone>

      {percent !== null && (
        <div className="absolute inset-x-4 bottom-3">
          <UploadProgress percent={percent} />
        </div>
      )}
      {error && (
        <p className="absolute inset-x-4 bottom-3 rounded-btn bg-card/95 px-2 py-1 text-xs font-medium text-signal-no">
          {error}
        </p>
      )}
    </div>
  )
}

function AvatarWithUpload({ data, name }: { data: TalentProfileFull; name: string }) {
  const media = useMediaMutations(data.profile.id)
  const updateAccount = useUpdateAccountProfile(data.profile.id)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'avatar', file, onProgress: setPercent })
      await updateAccount.mutateAsync({ avatar_url: asset.url })
      track('media_uploaded', { kind: 'avatar' })
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload your photo'))
    } finally {
      setPercent(null)
    }
  }

  return (
    <div className="group relative inline-flex">
      <Avatar
        src={data.profile.avatar_url ?? undefined}
        name={name}
        size="xl"
        ring
        className="border-4 border-card"
      />
      {percent !== null && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 text-white">
          <Spinner className="h-4 w-4" />
        </span>
      )}

      <FileDropzone
        kind="avatar"
        onFile={handleFile}
        onError={setError}
        disabled={percent !== null}
        bare
        className="absolute bottom-0 right-0 z-10"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white shadow-card">
          <Camera className="h-3.5 w-3.5" />
        </span>
      </FileDropzone>

      {error && (
        <p className="absolute left-0 top-full mt-1 w-40 text-xs font-medium text-signal-no">
          {error}
        </p>
      )}
    </div>
  )
}

// ── Modals ───────────────────────────────────────────────────────────────────

function IdentityModal({
  open,
  data,
  onClose,
  onSave,
  pending,
}: {
  open: boolean
  data: TalentProfileFull
  onClose: () => void
  onSave: (patch: {
    account: { first_name: string; last_name: string; city: string | null; country: string | null }
    talent: { professional_name: string | null; headline: string | null }
  }) => void
  pending?: boolean
}) {
  const [form, setForm] = useState({
    firstName: data.profile.first_name ?? '',
    lastName: data.profile.last_name ?? '',
    professionalName: data.talent.professional_name ?? '',
    headline: data.talent.headline ?? '',
    city: data.profile.city ?? '',
    country: data.profile.country ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <EditModal
      open={open}
      title="Edit profile"
      onClose={onClose}
      saveLabel={pending ? 'Saving…' : 'Save'}
      onSave={() => {
        if (!form.firstName.trim() || !form.lastName.trim()) {
          setError('First and last name are required')
          return
        }
        setError(null)
        onSave({
          account: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            city: form.city.trim() || null,
            country: form.country.trim() || null,
          },
          talent: {
            professional_name: form.professionalName.trim() || null,
            headline: form.headline.trim() || null,
          },
        })
      }}
    >
      {error && <FormError>{error}</FormError>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <TextInput value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name">
          <TextInput value={form.lastName} onChange={set('lastName')} />
        </Field>
      </div>
      <Field label="Professional name">
        <TextInput
          value={form.professionalName}
          onChange={set('professionalName')}
          placeholder="The name you are credited under"
        />
      </Field>
      <Field label="Headline">
        <TextInput
          value={form.headline}
          onChange={set('headline')}
          placeholder="Actress · Drama · SAG-AFTRA"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <TextInput value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Country">
          <TextInput value={form.country} onChange={set('country')} />
        </Field>
      </div>
    </EditModal>
  )
}

function AboutModal({
  open,
  bio,
  onClose,
  onSave,
}: {
  open: boolean
  bio: string
  onClose: () => void
  onSave: (bio: string) => void
}) {
  const [draft, setDraft] = useState(bio)

  return (
    <EditModal open={open} title="Edit about" onClose={onClose} onSave={() => onSave(draft.trim())}>
      <Field label="Bio">
        <TextArea rows={7} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </Field>
    </EditModal>
  )
}

function AppearanceModal({
  open,
  data,
  onClose,
  onSave,
}: {
  open: boolean
  data: TalentProfileFull
  onClose: () => void
  onSave: (patch: {
    gender: string | null
    playing_age_min: number | null
    playing_age_max: number | null
    height_cm: number | null
    ethnicities: string[]
    accents: string[]
    nationalities: string[]
    experience_level: string | null
  }) => void
}) {
  const [form, setForm] = useState({
    gender: data.talent.gender,
    min: data.talent.playing_age_min?.toString() ?? '',
    max: data.talent.playing_age_max?.toString() ?? '',
    height: data.talent.height_cm?.toString() ?? '',
    ethnicities: data.talent.ethnicities,
    accents: data.talent.accents,
    nationalities: data.talent.nationalities,
    experienceLevel: data.talent.experience_level,
  })
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const min = form.min ? Number(form.min) : null
    const max = form.max ? Number(form.max) : null
    if (min !== null && max !== null && min > max) {
      setError('The upper playing age must be greater than the lower one')
      return
    }
    const height = form.height ? Number(form.height) : null
    if (height !== null && (height < 50 || height > 260)) {
      setError('Enter a height in cm between 50 and 260')
      return
    }
    setError(null)
    onSave({
      gender: form.gender || null,
      playing_age_min: min,
      playing_age_max: max,
      height_cm: height,
      ethnicities: form.ethnicities,
      accents: form.accents,
      nationalities: form.nationalities,
      experience_level: form.experienceLevel || null,
    })
  }

  return (
    <EditModal open={open} title="Appearance & casting details" onClose={onClose} onSave={submit}>
      {error && <FormError>{error}</FormError>}

      <Field label="Gender">
        <SegmentedControl
          options={GENDER_OPTIONS}
          value={form.gender}
          allowClear
          size="sm"
          onChange={(gender) => setForm((current) => ({ ...current, gender }))}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Age from">
          <TextInput
            type="number"
            value={form.min}
            onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))}
          />
        </Field>
        <Field label="Age to">
          <TextInput
            type="number"
            value={form.max}
            onChange={(event) => setForm((current) => ({ ...current, max: event.target.value }))}
          />
        </Field>
        <Field label="Height (cm)">
          <TextInput
            type="number"
            value={form.height}
            onChange={(event) => setForm((current) => ({ ...current, height: event.target.value }))}
          />
        </Field>
      </div>

      <Field label="Experience">
        <SegmentedControl
          options={EXPERIENCE_OPTIONS}
          value={form.experienceLevel}
          allowClear
          size="sm"
          onChange={(experienceLevel) => setForm((current) => ({ ...current, experienceLevel }))}
        />
      </Field>

      <Field label="Ethnicities">
        <MultiSelect
          options={ETHNICITY_OPTIONS}
          values={form.ethnicities}
          onChange={(ethnicities) => setForm((current) => ({ ...current, ethnicities }))}
          emptyLabel="Nothing selected"
        />
      </Field>

      <Field label="Accents">
        <MultiSelect
          options={form.accents.map((value) => ({ value, label: value }))}
          values={form.accents}
          onChange={(accents) => setForm((current) => ({ ...current, accents }))}
          allowCreate
          placeholder="Add an accent…"
          emptyLabel="No accent added"
        />
      </Field>

      <Field label="Nationalities">
        <MultiSelect
          options={form.nationalities.map((value) => ({ value, label: value }))}
          values={form.nationalities}
          onChange={(nationalities) => setForm((current) => ({ ...current, nationalities }))}
          allowCreate
          placeholder="Add a nationality…"
          emptyLabel="None added"
        />
      </Field>
    </EditModal>
  )
}

function RepresentationModal({
  open,
  data,
  onClose,
  onSave,
}: {
  open: boolean
  data: TalentProfileFull
  onClose: () => void
  onSave: (patch: {
    agency_name: string | null
    agent_name: string | null
    agent_email: string | null
    agent_phone: string | null
  }) => void
}) {
  const [form, setForm] = useState({
    agency: data.talent.agency_name ?? '',
    agent: data.talent.agent_name ?? '',
    email: data.talent.agent_email ?? '',
    phone: data.talent.agent_phone ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <EditModal
      open={open}
      title="Representation"
      onClose={onClose}
      onSave={() => {
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
          setError('Enter a valid email address')
          return
        }
        setError(null)
        onSave({
          agency_name: form.agency.trim() || null,
          agent_name: form.agent.trim() || null,
          agent_email: form.email.trim() || null,
          agent_phone: form.phone.trim() || null,
        })
      }}
    >
      {error && <FormError>{error}</FormError>}
      <Field label="Agency">
        <TextInput value={form.agency} onChange={set('agency')} placeholder="Vertice Talent" />
      </Field>
      <Field label="Agent">
        <TextInput value={form.agent} onChange={set('agent')} />
      </Field>
      <Field label="Agent email">
        <TextInput value={form.email} onChange={set('email')} type="email" />
      </Field>
      <Field label="Agent phone">
        <TextInput value={form.phone} onChange={set('phone')} />
      </Field>
    </EditModal>
  )
}

function DetailsModal({
  open,
  data,
  onClose,
  onSave,
}: {
  open: boolean
  data: TalentProfileFull
  onClose: () => void
  onSave: (patch: {
    height_cm: number | null
    availability: 'available' | 'on_project' | 'unavailable'
    union_name: string | null
    website: string | null
  }) => void
}) {
  const [form, setForm] = useState({
    height: data.talent.height_cm?.toString() ?? '',
    availability: data.talent.availability,
    union: data.talent.union_name ?? '',
    website: data.talent.website ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  return (
    <EditModal
      open={open}
      title="Details"
      onClose={onClose}
      onSave={() => {
        const height = form.height ? Number(form.height) : null
        if (height !== null && (height < 50 || height > 260)) {
          setError('Enter a height in cm between 50 and 260')
          return
        }
        if (form.website && !/^https?:\/\/.+\..+/.test(form.website.trim())) {
          setError('Enter a full URL, starting with https://')
          return
        }
        setError(null)
        onSave({
          height_cm: height,
          availability: form.availability,
          union_name: form.union.trim() || null,
          website: form.website.trim() || null,
        })
      }}
    >
      {error && <FormError>{error}</FormError>}
      <Field label="Height (cm)">
        <TextInput
          type="number"
          value={form.height}
          onChange={(event) => setForm((current) => ({ ...current, height: event.target.value }))}
        />
      </Field>
      <Field label="Availability">
        <Select
          value={form.availability}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              availability: event.target.value as typeof current.availability,
            }))
          }
        >
          <option value="available">Available</option>
          <option value="on_project">On project</option>
          <option value="unavailable">Unavailable</option>
        </Select>
      </Field>
      <Field label="Union">
        <TextInput
          value={form.union}
          onChange={(event) => setForm((current) => ({ ...current, union: event.target.value }))}
          placeholder="SAG-AFTRA"
        />
      </Field>
      <Field label="Website">
        <TextInput
          value={form.website}
          onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
          placeholder="https://…"
        />
      </Field>
    </EditModal>
  )
}

function LanguagesModal({
  open,
  selected,
  options,
  onClose,
  onSave,
}: {
  open: boolean
  selected: string[]
  options: { value: string; label: string }[]
  onClose: () => void
  onSave: (codes: string[]) => void
}) {
  const [codes, setCodes] = useState(selected)

  return (
    <EditModal open={open} title="Languages" onClose={onClose} onSave={() => onSave(codes)}>
      <Field label="Languages you speak">
        <MultiSelect
          options={options}
          values={codes}
          onChange={setCodes}
          placeholder="Search a language…"
          emptyLabel="No language selected"
        />
      </Field>
    </EditModal>
  )
}

function CreditModal({
  draft,
  onClose,
  onSave,
}: {
  draft: Partial<CreditRow> | null
  onClose: () => void
  onSave: (values: {
    title: string
    role_name: string | null
    category: string | null
    year: string | null
    director: string | null
    company: string | null
    location: string | null
    url: string | null
  }) => void
}) {
  const [form, setForm] = useState({
    title: draft?.title ?? '',
    role: draft?.role_name ?? '',
    category: draft?.category ?? 'Film',
    year: draft?.year ?? '',
    company: draft?.company ?? '',
    director: draft?.director ?? '',
    location: draft?.location ?? '',
    url: draft?.url ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <EditModal
      open={Boolean(draft)}
      title={draft?.id ? 'Edit experience' : 'Add experience'}
      onClose={onClose}
      onSave={() => {
        if (!form.title.trim()) {
          setError('A project title is required')
          return
        }
        if (form.year && !/^\d{4}$/.test(form.year.trim())) {
          setError('Enter a four-digit year')
          return
        }
        if (form.url && !/^https?:\/\/.+\..+/.test(form.url.trim())) {
          setError('Enter a full URL, starting with https://')
          return
        }
        setError(null)
        onSave({
          title: form.title.trim(),
          role_name: form.role.trim() || null,
          category: form.category || null,
          year: form.year.trim() || null,
          director: form.director.trim() || null,
          company: form.company.trim() || null,
          location: form.location.trim() || null,
          url: form.url.trim() || null,
        })
      }}
    >
      {error && <FormError>{error}</FormError>}
      <Field label="Project title">
        <TextInput value={form.title} onChange={set('title')} />
      </Field>
      <Field label="Role">
        <TextInput value={form.role} onChange={set('role')} />
      </Field>
      <Field label="Type">
        <Select value={form.category} onChange={set('category')}>
          {['Film', 'TV series', 'Theatre', 'Commercial', 'Music video', 'Indie film', 'Short'].map(
            (type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ),
          )}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <TextInput value={form.year} onChange={set('year')} placeholder="2026" />
        </Field>
        <Field label="Company / network">
          <TextInput value={form.company} onChange={set('company')} />
        </Field>
      </div>
      <Field label="Director">
        <TextInput value={form.director} onChange={set('director')} />
      </Field>
      <Field label="Location">
        <TextInput value={form.location} onChange={set('location')} />
      </Field>
      <Field label="Production or company website">
        <TextInput value={form.url} onChange={set('url')} placeholder="https://…" />
      </Field>
    </EditModal>
  )
}

function TrainingModal({
  draft,
  onClose,
  onSave,
}: {
  draft: Partial<TrainingRow> | null
  onClose: () => void
  onSave: (values: {
    school: string
    program: string | null
    start_year: string | null
    end_year: string | null
    description: string | null
  }) => void
}) {
  const [form, setForm] = useState({
    school: draft?.school ?? '',
    program: draft?.program ?? '',
    startYear: draft?.start_year ?? '',
    endYear: draft?.end_year ?? '',
    description: draft?.description ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  return (
    <EditModal
      open={Boolean(draft)}
      title={draft?.id ? 'Edit training' : 'Add training'}
      onClose={onClose}
      onSave={() => {
        if (!form.school.trim()) {
          setError('A school or programme name is required')
          return
        }
        setError(null)
        onSave({
          school: form.school.trim(),
          program: form.program.trim() || null,
          start_year: form.startYear.trim() || null,
          end_year: form.endYear.trim() || null,
          description: form.description.trim() || null,
        })
      }}
    >
      {error && <FormError>{error}</FormError>}
      <Field label="School">
        <TextInput
          value={form.school}
          onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))}
        />
      </Field>
      <Field label="Programme">
        <TextInput
          value={form.program}
          onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <TextInput
            value={form.startYear}
            onChange={(event) =>
              setForm((current) => ({ ...current, startYear: event.target.value }))
            }
            placeholder="2018"
          />
        </Field>
        <Field label="To">
          <TextInput
            value={form.endYear}
            onChange={(event) => setForm((current) => ({ ...current, endYear: event.target.value }))}
            placeholder="2021"
          />
        </Field>
      </div>
      <Field label="Description">
        <TextArea
          rows={3}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </Field>
    </EditModal>
  )
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  onEdit,
  onAdd,
}: {
  title: string
  icon?: React.ReactNode
  onEdit?: () => void
  onAdd?: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="tech-label inline-flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onAdd && (
        <button
          onClick={onAdd}
          aria-label={`Add to ${title}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        onClick={onEdit}
        aria-label="Edit"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-signal-no/10 hover:text-signal-no"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SkillDots({
  level,
  onSet,
}: {
  level: 1 | 2 | 3
  onSet: (level: 1 | 2 | 3) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          onClick={() => onSet(n as 1 | 2 | 3)}
          aria-label={n === 1 ? 'Training' : n === 2 ? 'Proficient' : 'Expert'}
          className={cn(
            'h-2.5 w-2.5 rounded-full border',
            n <= level ? 'border-link bg-link' : 'border-line bg-transparent',
          )}
          title={n === 1 ? 'Training' : n === 2 ? 'Proficient' : 'Expert'}
        />
      ))}
    </div>
  )
}

function StatCell({
  value,
  label,
  loading,
}: {
  value: number
  label: string
  loading?: boolean
}) {
  return (
    <Card className="flex flex-col items-center gap-0.5 py-3">
      {loading ? (
        <Skeleton className="h-7 w-10" />
      ) : (
        <span className="text-2xl font-bold tracking-tight text-ink">{value}</span>
      )}
      <span className="text-label font-semibold uppercase tracking-label text-muted">{label}</span>
    </Card>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-label font-semibold uppercase tracking-label text-muted">{label}</p>
      <p className="mt-0.5 text-ink">{value || '—'}</p>
    </div>
  )
}

function TagDetail({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-label font-semibold uppercase tracking-label text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.length > 0 ? (
          values.map((value) => <Tag key={value}>{value}</Tag>)
        ) : (
          <span className="text-ink">—</span>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn('truncate font-medium', link ? 'text-link' : 'text-ink')}>{value}</span>
    </div>
  )
}
