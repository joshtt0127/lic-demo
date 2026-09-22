import { useState } from 'react'
import { Send } from 'lucide-react'
import { Avatar, Button, Card, FormError, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePostMutations } from '@/features/social/posts'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'

/** Publier quelque chose à son réseau. Texte seul : court, et vrai. */
export function PostComposer({ name }: { name: string }) {
  const t = useT()
  const { profile } = useAuth()
  const { publish } = usePostMutations(profile?.id)

  const [body, setBody] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!body.trim()) return
    setError(null)
    try {
      await publish.mutateAsync({ body })
      setBody('')
      setOpen(false)
    } catch (publishError) {
      setError(errorMessage(publishError, t('social.publishFailed')))
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar src={profile?.avatar_url ?? undefined} name={name} size="md" />
        {open ? (
          <span className="text-[14px] font-semibold text-ink">{t('social.composerTitle')}</span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[44px] flex-1 rounded-full border border-line bg-paper px-4 text-left text-[14px] text-muted transition-colors hover:border-ink/20 hover:text-ink"
          >
            {t('social.composerPlaceholder')}
          </button>
        )}
      </div>

      {open && (
        <>
          <textarea
            autoFocus
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            aria-label={t('social.composerTitle')}
            placeholder={t('social.composerHint')}
            className="w-full resize-none rounded-field border border-line bg-card p-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus:border-ink/30"
          />
          {error && <FormError>{error}</FormError>}
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto font-mono text-[11px] text-muted">{body.length}/2000</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                setBody('')
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!body.trim() || publish.isPending}
              icon={publish.isPending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
              onClick={submit}
            >
              {t('social.publish')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
