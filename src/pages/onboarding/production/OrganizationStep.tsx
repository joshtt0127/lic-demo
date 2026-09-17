import { useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, Upload } from 'lucide-react'
import { FormError, FormField, SelectInput, Spinner, TextField } from '@/components/ui'
import { TextArea } from '@/components/EditModal'
import { FileDropzone, UploadProgress } from '@/components/upload/FileDropzone'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOnboardingNav } from '@/features/onboarding/steps'
import { useMediaMutations } from '@/features/talent/queries'
import { useMyInvites, useOrganizationMutations } from '@/features/organizations/queries'
import { track } from '@/lib/analytics'
import { errorMessage } from '@/lib/supabase'
import { CountryField } from '../CountryField'

/**
 * Production step 2 — the team.
 *
 * A production account owns nothing until it belongs to an organization: no
 * project, no casting call, no candidate. So this step is required, and it is a
 * real write (organization + owner membership), not a form that goes nowhere.
 *
 * If someone was invited by email, the invitation is offered first.
 */

const COMPANY_TYPES = [
  'Studio',
  'Production company',
  'Casting agency',
  'Broadcaster',
  'Streaming platform',
  'Advertising agency',
  'Independent',
]

export function OrganizationStep() {
  const { profile, user } = useAuth()
  const profileId = profile?.id
  const nav = useOnboardingNav()
  const organizations = useOrganizationMutations(profileId)
  const media = useMediaMutations(profileId)
  const invites = useMyInvites(Boolean(user?.email))

  const [form, setForm] = useState({
    name: '',
    companyType: '',
    city: profile?.city ?? '',
    country: profile?.country ?? '',
    website: '',
    description: '',
  })
  const [logo, setLogo] = useState<{ url: string } | null>(null)
  const [logoPercent, setLogoPercent] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const pendingInvites = invites.data ?? []

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleLogo(file: File) {
    setFormError(null)
    setLogoPercent(0)
    try {
      const asset = await media.upload.mutateAsync({ kind: 'logo', file, onProgress: setLogoPercent })
      setLogo({ url: asset.url })
    } catch (uploadError) {
      setFormError(errorMessage(uploadError, 'Could not upload the logo'))
    } finally {
      setLogoPercent(null)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    if (!form.name.trim()) nextErrors.name = 'Your organization needs a name'
    if (form.website && !/^https?:\/\/.+\..+/.test(form.website.trim())) {
      nextErrors.website = 'Enter a full URL, starting with https://'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      const organization = await organizations.create.mutateAsync({
        name: form.name,
        companyType: form.companyType || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        logoUrl: logo?.url ?? null,
      })
      track('organization_created', { organization_id: organization.id })
      await nav.next()
    } catch (saveError) {
      setFormError(errorMessage(saveError, 'Could not create your organization'))
    }
  }

  async function join(inviteIndex: number) {
    const invite = pendingInvites[inviteIndex]
    if (!invite) return
    setFormError(null)
    try {
      await organizations.join.mutateAsync(invite)
      await nav.next()
    } catch (joinError) {
      setFormError(errorMessage(joinError, 'Could not join that organization'))
    }
  }

  const busy = organizations.create.isPending || organizations.join.isPending || nav.pending

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" noValidate>
      {(formError || nav.error) && <FormError>{formError ?? nav.error}</FormError>}

      {pendingInvites.length > 0 && (
        <section className="flex flex-col gap-3 rounded-field border border-line bg-card p-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
            You have been invited
          </span>
          {pendingInvites.map((invite, index) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] text-ink">
                <span className="font-bold">{invite.organization?.name ?? 'A team'}</span> invited you
                as {invite.role.replace('_', ' ')}.
              </span>
              <button
                type="button"
                onClick={() => join(index)}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-field bg-ink px-5 text-[14px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
              >
                {organizations.join.isPending ? <Spinner /> : <Check className="h-4 w-4" />}
                Join
              </button>
            </div>
          ))}
          <p className="text-[13px] text-muted">Or create your own organization below.</p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[19px] font-bold text-ink">Your organization</h2>
          <p className="mt-1 text-[14px] text-muted">
            Projects, castings and candidates belong to a team — you will be its owner and can
            invite the rest afterwards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-field bg-[#E9E7E1] text-muted">
            {logo ? (
              <img src={logo.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-7 w-7" />
            )}
          </span>

          <FileDropzone
            kind="logo"
            onFile={handleLogo}
            onError={setFormError}
            disabled={logoPercent !== null}
            bare
            className="min-w-[240px] flex-1"
          >
            <span className="flex w-full flex-col items-center gap-1 rounded-field bg-[#F1F0EB] px-6 py-5 transition-colors hover:bg-[#EAE8E2]">
              <span className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
                <Upload className="h-[18px] w-[18px]" />
                {logo ? 'Replace logo' : 'Upload a logo'}
              </span>
              <span className="text-[13px] text-muted">JPG, PNG · 5 MB max</span>
            </span>
          </FileDropzone>
        </div>
        {logoPercent !== null && <UploadProgress percent={logoPercent} />}
      </section>

      <TextField
        label="Organization name"
        plainLabel
        fieldSize="lg"
        placeholder="A24, Pathé, Studio 13…"
        value={form.name}
        onChange={set('name')}
        error={errors.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Type" htmlFor="org-type" plainLabel optional>
          <SelectInput
            id="org-type"
            fieldSize="lg"
            value={form.companyType}
            onChange={(event) =>
              setForm((current) => ({ ...current, companyType: event.target.value }))
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

        <TextField
          label="Website"
          plainLabel
          optional
          fieldSize="lg"
          placeholder="https://…"
          value={form.website}
          onChange={set('website')}
          error={errors.website}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="City"
          plainLabel
          optional
          fieldSize="lg"
          placeholder="Paris"
          value={form.city}
          onChange={set('city')}
        />
        <CountryField
          optional
          value={form.country}
          onChange={(country) => setForm((current) => ({ ...current, country }))}
        />
      </div>

      <FormField label="Description" htmlFor="org-description" plainLabel optional>
        <TextArea
          id="org-description"
          rows={3}
          placeholder="What your company makes."
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </FormField>

      <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => void nav.back()}
          disabled={busy}
          className="inline-flex h-14 items-center gap-2.5 rounded-field border border-line bg-card px-7 text-[15px] font-bold text-ink transition-colors hover:bg-paper disabled:opacity-60"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Back
        </button>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-14 items-center justify-center gap-2.5 rounded-field bg-ink px-9 text-[15px] font-bold text-white transition-all hover:bg-ink/90 active:scale-[0.99] disabled:opacity-60"
        >
          {busy && <Spinner className="h-[18px] w-[18px]" />}
          Create and enter Let It Cast
          {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </form>
  )
}
