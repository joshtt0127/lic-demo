import { useState } from 'react'
import { AlertTriangle, CornerDownRight, Sparkles } from 'lucide-react'
import { Button, FormError, Input, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAiReview, useRequestAiReview, FRAME_COUNT } from '@/features/selftapes/aiReview'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import type { RoleRow } from '@/types/database'

/** Ce qu'un directeur de casting ferait du comédien, dit comme en salle. */
const CALL: Record<string, { label: string; className: string }> = {
  callback: { label: 'Would call back', className: 'bg-signal-good-bg text-signal-good' },
  maybe: { label: 'On the maybe pile', className: 'bg-signal-maybe/15 text-[#8A6D00]' },
  pass: { label: 'Would pass', className: 'bg-signal-no/10 text-signal-no' },
}

/**
 * L'avis de l'IA sur une tape, pour aider un choix — pas pour le faire.
 *
 * Le modèle joue un directeur de casting chevronné : il rend une note par trait
 * **avec ce qu'il a vu**, puis ce qu'il ferait du comédien et l'ajustement qu'il
 * demanderait pour une seconde prise. Un score sans justification n'aide
 * personne à caster : c'est pour ça que l'UI n'affiche jamais l'un sans l'autre.
 */
export function AiTapeReview({
  selfTapeId,
  tapeUrl,
  role,
  canRequest,
}: {
  selfTapeId: string
  tapeUrl: string
  role: Pick<RoleRow, 'name' | 'description' | 'selftape_instructions'> | null
  canRequest: boolean
}) {
  const { profile } = useAuth()
  const existing = useAiReview(selfTapeId)
  const request = useRequestAiReview(profile?.id)

  const [traits, setTraits] = useState('')
  const [stage, setStage] = useState<'idle' | 'frames' | 'thinking'>('idle')
  const [error, setError] = useState<string | null>(null)

  const review = request.data ?? existing.data
  const ready = review?.status === 'ready'

  async function run() {
    setError(null)
    setStage('frames')
    try {
      // L'extraction se voit : c'est la partie qui prend le plus de temps.
      setTimeout(() => setStage('thinking'), 1200)
      await request.mutateAsync({
        selfTapeId,
        tapeUrl,
        traits: traits
          .split(',')
          .map((trait) => trait.trim())
          .filter(Boolean),
        role: {
          name: role?.name,
          description: role?.description,
          instructions: role?.selftape_instructions,
        },
      })
    } catch (runError) {
      setError(errorMessage(runError, 'The analysis could not run'))
    } finally {
      setStage('idle')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-field border border-line bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tech-label inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          AI read of the tape
        </span>
        {ready && review?.fit_score !== null && review?.fit_score !== undefined && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 font-mono text-[12px] font-bold',
              review.fit_score >= 70
                ? 'bg-signal-good-bg text-signal-good'
                : review.fit_score >= 40
                  ? 'bg-signal-maybe/15 text-[#8A6D00]'
                  : 'bg-signal-no/10 text-signal-no',
            )}
          >
            fit {review.fit_score}/100
          </span>
        )}
      </div>

      {ready && review?.recommendation && CALL[review.recommendation] && (
        <span
          className={cn(
            'w-fit rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]',
            CALL[review.recommendation].className,
          )}
        >
          {CALL[review.recommendation].label}
        </span>
      )}

      {canRequest && (
        <div className="flex flex-col gap-2">
          <Input
            value={traits}
            onChange={(event) => setTraits(event.target.value)}
            placeholder="Traits to assess — authority, fragility, irony…"
            aria-label="Traits to assess"
          />
          <Button
            size="sm"
            className="w-fit"
            disabled={stage !== 'idle' || request.isPending}
            icon={
              stage === 'idle' ? <Sparkles className="h-3.5 w-3.5" /> : <Spinner />
            }
            onClick={run}
          >
            {stage === 'frames'
              ? `Reading ${FRAME_COUNT} frames…`
              : stage === 'thinking'
                ? 'Watching the tape…'
                : review
                  ? 'Run the analysis again'
                  : 'Analyse this tape'}
          </Button>
        </div>
      )}

      {error && <FormError>{error}</FormError>}

      {review?.status === 'failed' && !error && (
        <p className="flex items-start gap-2 text-[13px] text-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-no" />
          {review.error}
        </p>
      )}

      {ready && review && (
        <div className="flex flex-col gap-3">
          {review.summary && (
            <p className="text-[13.5px] leading-relaxed text-ink/90">{review.summary}</p>
          )}

          {review.traits.length > 0 && (
            <ul className="flex flex-col gap-2">
              {review.traits.map((trait) => (
                <li key={trait.trait} className="rounded-field bg-paper p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold capitalize text-ink">
                      {trait.trait}
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-muted">
                      {trait.score === null ? 'not readable on stills' : `${trait.score}/100`}
                    </span>
                  </div>
                  {trait.evidence && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                      {trait.evidence}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(review.strengths.length > 0 || review.risks.length > 0) && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {review.strengths.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-good">
                    Strengths
                  </span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {review.strengths.map((item) => (
                      <li key={item} className="text-[12.5px] text-ink/90">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {review.risks.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-no">
                    Reservations
                  </span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {review.risks.map((item) => (
                      <li key={item} className="text-[12.5px] text-ink/90">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {review.direction && (
            <p className="flex items-start gap-2 rounded-field bg-paper p-2.5 text-[12.5px] leading-relaxed text-ink/90">
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <span>
                <span className="font-semibold">On a second take · </span>
                {review.direction}
              </span>
            </p>
          )}

          <p className="text-[11.5px] leading-relaxed text-muted">
            {review.model} · {review.frames} frames. Stills carry no voice and no rhythm — this
            is a reading to argue with, not a decision. Your votes and notes stay the record.
          </p>
        </div>
      )}
    </div>
  )
}
