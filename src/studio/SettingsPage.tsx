import { useState } from 'react'
import { Building2, KeyRound, LogOut, Upload, User } from 'lucide-react'
import {
  Button,
  Card,
  FormError,
  FormField,
  PasswordInput,
  SelectInput,
  Spinner,
  TextField,
} from '@/components/ui'
import { TextArea } from '@/components/EditModal'
import { Skeleton } from '@/components/Skeleton'
import { AvatarUpload } from '@/components/upload/AvatarUpload'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentOrganization, useOrganizationMutations } from '@/features/organizations/queries'
import { useMediaMutations } from '@/features/talent/queries'
import { updateProfile, upsertProductionProfile } from '@/data/repositories/profiles'
import { can, displayName, ORG_ROLE_LABEL } from '@/lib/access'
import { errorMessage } from '@/lib/supabase'
import { CountryField } from '@/pages/onboarding/CountryField'

/** Account and organization settings — all of it writes to the database. */

const COMPANY_TYPES = [
  'Studio',
  'Production company',
  'Casting agency',
  'Broadcaster',
  'Streaming platform',
  'Advertising agency',
  'Independent',
]

export function SettingsPage() {
  const toast = useToast()
  const { profile, user, refreshProfile, updatePassword, signOut } = useAuth()
  const { organization, isLoading } = useCurrentOrganization(profile?.id)
  const orgMutations = useOrganizationMutations(profile?.id)
  const media = useMediaMutations(profile?.id)

  const [me, setMe] = useState({
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    city: profile?.city ?? '',
    country: profile?.country ?? '',
    jobTitle: '',
  })
  const [org, setOrg] = useState({
    name: '',
    companyType: '',
    city: '',
    country: '',
    website: '',
    description: '',
    logoUrl: null as string | null,
    seeded: false,
  })
  const [password, setPassword] = useState('')
  const [logoPercent, setLogoPercent] = useState<number | null>(null)
  const [savingMe, setSavingMe] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seeding once from the loaded row: a guarded render-phase update, which is
  // React's documented way to adjust state when the data it mirrors arrives.
  if (organization && !org.seeded) {
    setOrg({
      name: organization.name,
      companyType: organization.company_type ?? '',
      city: organization.city ?? '',
      country: organization.country ?? '',
      website: organization.website ?? '',
      description: organization.description ?? '',
      logoUrl: organization.logo_url,
      seeded: true,
    })
  }

  const mayManage = can(organization?.role, 'org:manage')

  async function saveMe() {
    if (!profile) return
    setError(null)
    if (!me.firstName.trim() || !me.lastName.trim()) {
      setError('First and last name are required')
      return
    }
    setSavingMe(true)
    try {
      await updateProfile(profile.id, {
        first_name: me.firstName.trim(),
        last_name: me.lastName.trim(),
        city: me.city.trim() || null,
        country: me.country.trim() || null,
      })
      await upsertProductionProfile(profile.id, { job_title: me.jobTitle.trim() || null })
      await refreshProfile()
      toast('Profile saved')
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save your profile'))
    } finally {
      setSavingMe(false)
    }
  }

  async function saveOrg() {
    if (!organization) return
    setError(null)
    if (!org.name.trim()) {
      setError('Your organization needs a name')
      return
    }
    if (org.website && !/^https?:\/\/.+\..+/.test(org.website.trim())) {
      setError('Enter a full URL, starting with https://')
      return
    }
    try {
      await orgMutations.update.mutateAsync({
        id: organization.id,
        patch: {
          name: org.name.trim(),
          company_type: org.companyType || null,
          city: org.city.trim() || null,
          country: org.country.trim() || null,
          website: org.website.trim() || null,
          description: org.description.trim() || null,
          logo_url: org.logoUrl,
        },
      })
      toast('Organization saved')
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save the organization'))
    }
  }

  async function uploadLogo(file: File) {
    setError(null)
    setLogoPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'logo', file, onProgress: setLogoPercent })
      setOrg((current) => ({ ...current, logoUrl: asset.url }))
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload the logo'))
    } finally {
      setLogoPercent(null)
    }
  }

  async function changePassword() {
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters')
      return
    }
    const result = await updatePassword(password)
    if (result.error) {
      setError(result.error)
      return
    }
    setPassword('')
    toast('Password updated')
  }

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
          Settings
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {user?.email}
          {organization ? ` · ${organization.name} · ${ORG_ROLE_LABEL[organization.role]}` : ''}
        </p>
      </header>

      {error && <FormError>{error}</FormError>}

      {/* ── You ── */}
      <Card className="flex flex-col gap-5">
        <span className="tech-label inline-flex items-center gap-1.5">
          <User className="h-4 w-4" />
          Your profile
        </span>

        <AvatarUpload
          profileId={profile?.id as string}
          avatarUrl={profile?.avatar_url ?? null}
          name={displayName(profile)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            plainLabel
            fieldSize="lg"
            value={me.firstName}
            onChange={(event) => setMe((current) => ({ ...current, firstName: event.target.value }))}
          />
          <TextField
            label="Last name"
            plainLabel
            fieldSize="lg"
            value={me.lastName}
            onChange={(event) => setMe((current) => ({ ...current, lastName: event.target.value }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Job title"
            plainLabel
            optional
            fieldSize="lg"
            placeholder="Casting director"
            value={me.jobTitle}
            onChange={(event) => setMe((current) => ({ ...current, jobTitle: event.target.value }))}
          />
          <TextField
            label="City"
            plainLabel
            optional
            fieldSize="lg"
            value={me.city}
            onChange={(event) => setMe((current) => ({ ...current, city: event.target.value }))}
          />
          <CountryField
            optional
            value={me.country}
            onChange={(country) => setMe((current) => ({ ...current, country }))}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={saveMe} disabled={savingMe} icon={savingMe ? <Spinner /> : undefined}>
            Save profile
          </Button>
        </div>
      </Card>

      {/* ── Organization ── */}
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : organization ? (
        <Card className="flex flex-col gap-5">
          <div>
            <span className="tech-label inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              Organization
            </span>
            {!mayManage && (
              <p className="mt-1 text-[13px] text-muted">
                Only an owner or admin can change these details.
              </p>
            )}
          </div>

          <FormField label="Logo" plainLabel>
            <div className="flex items-center gap-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-field bg-[#E9E7E1] text-muted">
                {org.logoUrl ? (
                  <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-6 w-6" />
                )}
              </span>
              {mayManage && (
                <FileDropzone kind="logo" onFile={uploadLogo} onError={setError} bare className="flex-1">
                  <span className="flex w-full flex-col items-center gap-1 rounded-field bg-[#F1F0EB] px-4 py-4 transition-colors hover:bg-[#EAE8E2]">
                    <span className="inline-flex items-center gap-2 text-[14px] font-bold text-ink">
                      {logoPercent !== null ? <Spinner /> : <Upload className="h-4 w-4" />}
                      {org.logoUrl ? 'Replace logo' : 'Upload a logo'}
                    </span>
                    <span className="text-[12px] text-muted">JPG, PNG · 5 MB max</span>
                  </span>
                </FileDropzone>
              )}
            </div>
            {logoPercent !== null && <UploadProgress percent={logoPercent} />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Name"
              plainLabel
              fieldSize="lg"
              disabled={!mayManage}
              value={org.name}
              onChange={(event) => setOrg((current) => ({ ...current, name: event.target.value }))}
            />
            <FormField label="Type" htmlFor="org-company-type" plainLabel optional>
              <SelectInput
                id="org-company-type"
                fieldSize="lg"
                disabled={!mayManage}
                value={org.companyType}
                onChange={(event) =>
                  setOrg((current) => ({ ...current, companyType: event.target.value }))
                }
              >
                <option value="">Select a type</option>
                {COMPANY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="City"
              plainLabel
              optional
              fieldSize="lg"
              disabled={!mayManage}
              value={org.city}
              onChange={(event) => setOrg((current) => ({ ...current, city: event.target.value }))}
            />
            <CountryField
              optional
              value={org.country}
              onChange={(country) => setOrg((current) => ({ ...current, country }))}
            />
            <TextField
              label="Website"
              plainLabel
              optional
              fieldSize="lg"
              disabled={!mayManage}
              placeholder="https://…"
              value={org.website}
              onChange={(event) => setOrg((current) => ({ ...current, website: event.target.value }))}
            />
          </div>

          <FormField label="Description" htmlFor="org-desc" plainLabel optional>
            <TextArea
              id="org-desc"
              rows={3}
              disabled={!mayManage}
              value={org.description}
              onChange={(event) =>
                setOrg((current) => ({ ...current, description: event.target.value }))
              }
            />
          </FormField>

          {mayManage && (
            <div className="flex justify-end">
              <Button
                onClick={saveOrg}
                disabled={orgMutations.update.isPending}
                icon={orgMutations.update.isPending ? <Spinner /> : undefined}
              >
                Save organization
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      {/* ── Security ── */}
      <Card className="flex flex-col gap-4">
        <span className="tech-label inline-flex items-center gap-1.5">
          <KeyRound className="h-4 w-4" />
          Password
        </span>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <FormField label="New password" htmlFor="new-password" plainLabel>
            <PasswordInput
              id="new-password"
              fieldSize="lg"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          <div className="flex items-end">
            <Button size="lg" variant="secondary" onClick={changePassword} disabled={!password}>
              Update password
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px] text-muted">Signed in as {user?.email}</span>
        <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  )
}
