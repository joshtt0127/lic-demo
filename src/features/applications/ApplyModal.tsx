import { useState } from 'react'
import { Check, Film } from 'lucide-react'
import { Avatar, FormError, FormField, Spinner } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useApplicationMutations } from '@/features/applications/queries'
import { useTalentProfile } from '@/features/talent/queries'
import { publicUrl } from '@/lib/storage'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/** The apply form: a note, a headshot and a showreel picked from your media. */
export function ApplyModal({
  role,
  castingTitle,
  onClose,
}: {
  role: RoleRow
  castingTitle: string
  onClose: () => void
}) {
  const toast = useToast()
  const { profile } = useAuth()
  const profileId = profile?.id
  const talent = useTalentProfile(profileId)
  const { apply } = useApplicationMutations(profileId)

  const media = talent.data?.media ?? []
  const headshots = media.filter((asset) => asset.kind === 'headshot' || asset.kind === 'portfolio')
  const showreels = media.filter((asset) => asset.kind === 'showreel')

  const [note, setNote] = useState('')
  const [headshotId, setHeadshotId] = useState<string | null>(headshots[0]?.id ?? null)
  const [showreelId, setShowreelId] = useState<string | null>(showreels[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await apply.mutateAsync({ roleId: role.id, note, headshotId, showreelId })
      toast(`Application sent for ${role.name}`)
      onClose()
    } catch (applyError) {
      setError(errorMessage(applyError, 'Could not send your application'))
    }
  }

  return (
    <EditModal
      open
      title={`Apply — ${role.name}`}
      onClose={onClose}
      onSave={submit}
      saveLabel={apply.isPending ? 'Sending…' : 'Submit application'}
    >
      {error && <FormError>{error}</FormError>}

      <p className="text-[13px] text-muted">
        {castingTitle} · your profile is attached automatically. The production sees your name,
        casting details, skills and credits.
      </p>

      <Field label="Note to the casting director">
        <TextArea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional — anything they should know."
        />
      </Field>

      <FormField label="Headshot" plainLabel>
        {headshots.length === 0 ? (
          <p className="text-[13px] text-muted">
            No headshot on your profile yet — you can still apply and add one later.
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

      <FormField label="Showreel" plainLabel>
        {showreels.length === 0 ? (
          <p className="text-[13px] text-muted">No showreel on your profile yet.</p>
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
          Sending your application…
        </span>
      )}

      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Avatar src={profile?.avatar_url ?? undefined} name="You" size="xs" />
        Submitted as {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
      </p>
    </EditModal>
  )
}
