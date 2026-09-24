import { useState } from 'react'
import { Calendar, Check, Clapperboard, MapPin, Video, X } from 'lucide-react'
import { Button, FormError, Tag } from '@/components/ui'
import { useCallbackMutations } from '@/features/callbacks/queries'
import { errorMessage } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import type { CallbackRow } from '@/types/database'

/**
 * Le callback, vu du comédien.
 *
 * Ce qu'il doit lire d'un coup d'œil : quoi, quand, où — et **dans quel
 * fuseau**, parce que la production n'est pas toujours dans le sien. L'heure
 * est donc affichée dans le fuseau proposé, avec son nom, plutôt que traduite
 * en silence dans celui du navigateur.
 *
 * Et trois réponses, parce qu'un comédien a une vie : accepter, décliner, ou
 * demander un autre créneau. Le silence n'en est pas une.
 */
const ICON = { in_person: MapPin, video_call: Video, self_tape: Clapperboard } as const

export function CallbackCard({ callback }: { callback: CallbackRow }) {
  const t = useT()
  const { answer } = useCallbackMutations(callback.application_id)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = ICON[callback.kind]

  const when = callback.scheduled_at
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: callback.timezone ?? undefined,
      }).format(new Date(callback.scheduled_at))
    : null

  function reply(response: 'accepted' | 'declined' | 'change_requested') {
    setError(null)
    answer.mutate(
      { id: callback.id, response, note },
      { onError: (replyError) => setError(errorMessage(replyError, t('callback.failed'))) },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-field border border-link/25 bg-link/5 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink">
          <Icon className="h-4 w-4" />
          {callback.title || t(`callback.kind.${callback.kind}`)}
        </span>
        {callback.response !== 'pending' && (
          <Tag tone={callback.response === 'accepted' ? 'good' : 'neutral'}>
            {t(`callback.response.${callback.response}`)}
          </Tag>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[13px] text-ink/90">
        {when && (
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted" />
            {when}
            {callback.timezone && <span className="text-muted">({callback.timezone})</span>}
          </span>
        )}
        {callback.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
            {callback.location}
          </span>
        )}
        {callback.meeting_url && (
          <a
            href={callback.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-link hover:underline"
          >
            <Video className="h-3.5 w-3.5 shrink-0" />
            {t('callback.join')}
          </a>
        )}
        {callback.instructions && (
          <p className="mt-1 leading-relaxed text-muted">{callback.instructions}</p>
        )}
        {callback.message && <p className="leading-relaxed text-ink/80">“{callback.message}”</p>}
      </div>

      {error && <FormError>{error}</FormError>}

      {callback.response === 'pending' && (
        <div className="flex flex-col gap-2">
          {asking && (
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('callback.changePlaceholder')}
              aria-label={t('callback.changePlaceholder')}
              className="w-full resize-none rounded-btn border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-ink/30"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={answer.isPending}
              icon={<Check className="h-3.5 w-3.5" />}
              onClick={() => reply('accepted')}
            >
              {t('callback.accept')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={answer.isPending}
              onClick={() => (asking ? reply('change_requested') : setAsking(true))}
            >
              {t('callback.askAnother')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={answer.isPending}
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => reply('declined')}
            >
              {t('callback.decline')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
