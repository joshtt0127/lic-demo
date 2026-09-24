import { useState } from 'react'
import { MapPin, Video, Clapperboard } from 'lucide-react'
import { FormError, Input } from '@/components/ui'
import { EditModal, Field, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useCallbackMutations } from '@/features/callbacks/queries'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { CallbackKind } from '@/types/database'

/**
 * Proposer un callback.
 *
 * Trois formes, parce que le métier en a trois, et chacune demande ce sans quoi
 * elle ne veut rien dire : une adresse pour un rendez-vous, un lien pour une
 * visio, une consigne pour une nouvelle tape. La base pose la même contrainte —
 * l'écran ne fait que l'énoncer avant.
 *
 * Le fuseau part avec l'heure : « mardi 14 h » n'a pas le même sens à Paris et
 * à Montréal, et la production et le comédien ne sont pas toujours au même
 * endroit.
 */
const KINDS: { value: CallbackKind; label: string; icon: typeof MapPin; hint: string }[] = [
  { value: 'in_person', label: 'In person', icon: MapPin, hint: 'An address and a time.' },
  { value: 'video_call', label: 'Video call', icon: Video, hint: 'A link and a time.' },
  { value: 'self_tape', label: 'New self-tape', icon: Clapperboard, hint: 'What you want to see.' },
]

export function RequestCallbackModal({
  applicationId,
  talentName,
  onClose,
}: {
  applicationId: string
  talentName: string
  onClose: () => void
}) {
  const toast = useToast()
  const { request } = useCallbackMutations(applicationId)

  const [kind, setKind] = useState<CallbackKind>('in_person')
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [instructions, setInstructions] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setError(null)
    try {
      await request.mutateAsync({
        applicationId,
        kind,
        title,
        scheduledAt: kind === 'self_tape' || !scheduledAt ? null : new Date(scheduledAt).toISOString(),
        location: kind === 'in_person' ? location : null,
        meetingUrl: kind === 'video_call' ? meetingUrl : null,
        instructions: kind === 'self_tape' ? instructions : instructions || null,
        message,
      })
      toast(`Callback sent to ${talentName}`)
      onClose()
    } catch (requestError) {
      setError(errorMessage(requestError, 'The callback could not be sent'))
    }
  }

  return (
    <EditModal
      open
      title={`Callback — ${talentName}`}
      onClose={onClose}
      onSave={send}
      saveLabel={request.isPending ? 'Sending…' : 'Send the callback'}
    >
      {error && <FormError>{error}</FormError>}

      <div className="grid grid-cols-3 gap-2">
        {KINDS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-field border p-3 text-[12.5px] font-semibold transition-colors',
              kind === value ? 'border-ink/30 bg-paper text-ink' : 'border-line text-muted hover:border-ink/20',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-[12px] text-muted">{KINDS.find((k) => k.value === kind)?.hint}</p>

      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Callback — Iris" />
      </Field>

      {kind !== 'self_tape' && (
        <Field label="When">
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </Field>
      )}

      {kind === 'in_person' && (
        <Field label="Where">
          <Input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="12 rue de Rivoli, Paris"
          />
        </Field>
      )}

      {kind === 'video_call' && (
        <Field label="Meeting link">
          <Input
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://meet…"
          />
        </Field>
      )}

      <Field label={kind === 'self_tape' ? 'What you want to see' : 'Instructions (optional)'}>
        <TextArea
          rows={2}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Scene 4, two takes — the second one angrier."
        />
      </Field>

      <Field label="A word with it (optional)">
        <TextArea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} />
      </Field>
    </EditModal>
  )
}
