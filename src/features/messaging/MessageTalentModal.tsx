import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send } from 'lucide-react'
import { Avatar, FormError, FormField, Spinner } from '@/components/ui'
import { EditModal, TextArea } from '@/components/EditModal'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useMessagingMutations } from '@/features/messaging/queries'
import { errorMessage } from '@/lib/supabase'
import type { ConversationContext } from '@/types/database'

/** A few openers a casting director actually sends — one click, then edit. */
const OPENERS = [
  { label: 'Invite to a callback', body: 'We would like to see you for a callback — which days work for you next week?' },
  { label: 'Ask for a new tape', body: 'Could you send us another tape? We would like to see the scene played lighter.' },
  { label: 'Ask about availability', body: 'Are you available for the shooting dates on this project?' },
]

/**
 * Production → talent message.
 *
 * It writes a real conversation (reused when one already exists for the same
 * role or application) and a real message, so the talent gets it in their inbox
 * with a notification — the same thread on both sides of the marketplace.
 */
export function MessageTalentModal({
  talent,
  subject,
  contextType,
  contextId,
  orgId,
  onClose,
}: {
  talent: { id: string; name: string; avatarUrl?: string | null }
  /** What the thread is about, e.g. "Evermore — Fanny Brice". */
  subject?: string | null
  contextType?: ConversationContext
  contextId?: string | null
  orgId?: string | null
  onClose: () => void
}) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { start } = useMessagingMutations(profile?.id)

  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!body.trim()) {
      setError('Write your message first.')
      return
    }
    setError(null)
    try {
      const conversationId = await start.mutateAsync({
        withProfileId: talent.id,
        body,
        subject,
        contextType,
        contextId,
        orgId,
      })
      toast(`Message sent to ${talent.name}`)
      onClose()
      navigate(`/studio/messages?conversation=${conversationId}`)
    } catch (sendError) {
      setError(errorMessage(sendError, 'Could not send your message'))
    }
  }

  return (
    <EditModal
      open
      title={`Message ${talent.name}`}
      onClose={onClose}
      onSave={submit}
      saveLabel={start.isPending ? 'Sending…' : 'Send message'}
    >
      {error && <FormError>{error}</FormError>}

      <div className="flex items-center gap-3 rounded-field bg-paper p-3">
        <Avatar src={talent.avatarUrl ?? undefined} name={talent.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">{talent.name}</p>
          <p className="truncate text-[12px] text-muted">{subject || 'Direct message'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {OPENERS.map((opener) => (
          <button
            key={opener.label}
            type="button"
            onClick={() => setBody(opener.body)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink"
          >
            {opener.label}
          </button>
        ))}
      </div>

      <FormField label="Your message" htmlFor="message-talent-body" plainLabel>
        <TextArea
          id="message-talent-body"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write to the actor…"
        />
      </FormField>

      <p className="flex items-center gap-2 text-[12px] text-muted">
        {start.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
        They receive it in their Let It Cast inbox, with a notification. You can keep the
        conversation going from Inbox.
      </p>
    </EditModal>
  )
}
