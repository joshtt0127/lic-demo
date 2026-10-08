import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Play, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { useLanguagesCatalog } from '@/features/talent/queries'
import { CASTING_FIELDS, FIELD_LABELS, LIST_FIELDS, timecode, type Accepted } from '@/features/briefs/mapping'
import { languageFlag } from '@/lib/languageFlags'
import { cn } from '@/lib/cn'
import type { BriefExtractedField, BriefExtractionRow } from '@/types/database'

/**
 * « Draft first. Never blind save. » — l'écran où la production valide ce que
 * Let It Cast a compris de son brief.
 *
 *   DETECTED  dit explicitement — coché d'office, modifiable ;
 *   SUGGESTED interprété — décoché : il faut le confirmer ;
 *   MISSING   non dit — reste vide, sauf si la production le complète ici.
 *
 * Chaque valeur garde sa source : le minutage relance la vidéo au bon endroit
 * et la phrase exacte est citée. « Où Let It Cast a-t-il pris ça ? » a
 * toujours une réponse.
 */

const STATUS_STYLE: Record<BriefExtractedField['status'], { label: string; className: string }> = {
  detected: { label: 'Detected', className: 'bg-signal-good-bg text-signal-good' },
  suggested: { label: 'Suggested', className: 'bg-cream text-ink' },
  missing: { label: 'Missing', className: 'bg-line text-muted' },
}

const LONG_FIELDS = new Set([
  'synopsis',
  'director_brief',
  'casting_description',
  'description',
  'selftape_instructions',
  'requirements',
])

type RowState = { include: boolean; value: string; values: string[] }

export function ExtractionReview({
  extraction,
  onSeek,
  onApply,
}: {
  extraction: BriefExtractionRow
  onSeek: (seconds: number) => void
  onApply: (accepted: Accepted) => void
}) {
  const languages = useLanguagesCatalog()
  const languageName = (code: string) =>
    (languages.data ?? []).find((language) => language.code === code)?.name ?? code

  const fields = useMemo(() => extraction.fields ?? [], [extraction.fields])
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.field,
        {
          include: field.status === 'detected',
          value: field.value ?? '',
          values: field.values ?? [],
        },
      ]),
    ),
  )
  const [showTranscript, setShowTranscript] = useState(false)

  const ordered = useMemo(() => {
    const rank = { detected: 0, suggested: 1, missing: 2 }
    return [...fields].sort((a, b) => rank[a.status] - rank[b.status])
  }, [fields])

  // Brief projet : certains champs vont au projet, d'autres à l'annonce
  // (étape suivante). On le montre plutôt que de les verser en silence.
  const groups =
    extraction.target === 'project'
      ? [
          { key: 'project', title: 'Project', hint: null, fields: ordered.filter((f) => !CASTING_FIELDS.has(f.field)) },
          {
            key: 'casting',
            title: 'Casting call',
            hint: 'These fill the casting call section of the form below.',
            fields: ordered.filter((f) => CASTING_FIELDS.has(f.field)),
          },
        ].filter((group) => group.fields.length > 0)
      : [{ key: 'all', title: null, hint: null, fields: ordered }]

  const counts = {
    detected: fields.filter((f) => f.status === 'detected').length,
    suggested: fields.filter((f) => f.status === 'suggested').length,
    missing: fields.filter((f) => f.status === 'missing').length,
  }
  const included = Object.values(rows).filter(
    (row) => row.include && (row.value.trim() || row.values.length),
  ).length

  const update = (field: string, patch: Partial<RowState>) =>
    setRows((current) => ({ ...current, [field]: { ...current[field], ...patch } }))

  function apply() {
    const accepted: Accepted = {}
    for (const [field, row] of Object.entries(rows)) {
      if (!row.include) continue
      if (!row.value.trim() && row.values.length === 0) continue
      accepted[field] = { value: row.value.trim() || null, values: row.values }
    }
    onApply(accepted)
  }

  return (
    <div className="flex flex-col gap-4 rounded-field border border-line bg-paper p-4">
      {/* L'analyse a abouti mais n'a pas tout entendu (son coupé, fin manquante). */}
      {extraction.error && (
        <p className="flex items-start gap-2 rounded-field bg-signal-no/10 p-3 text-[13px] leading-snug text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-no" />
          {extraction.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-ink">Here is what we understood</p>
          <p className="text-[12.5px] text-muted">
            {counts.detected} detected · {counts.suggested} to confirm · {counts.missing} not in the
            brief. Nothing is saved until you apply it.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setRows((current) =>
              Object.fromEntries(
                Object.entries(current).map(([field, row]) => [
                  field,
                  fields.find((f) => f.field === field)?.status === 'detected'
                    ? { ...row, include: true }
                    : row,
                ]),
              ),
            )
          }
        >
          Accept all detected
        </Button>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          {group.title && (
            <div>
              <p className="text-[13px] font-bold text-ink">{group.title}</p>
              {group.hint && <p className="text-[12px] text-muted">{group.hint}</p>}
            </div>
          )}
          <ul className="flex flex-col divide-y divide-line rounded-field border border-line bg-card">
            {group.fields.map((field) => {
              const row = rows[field.field]
              if (!row) return null
              const style = STATUS_STYLE[field.status]
              const isList = LIST_FIELDS.has(field.field)
              const long = LONG_FIELDS.has(field.field)
              return (
                <li key={field.field} className="flex flex-col gap-2 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) => update(field.field, { include: event.target.checked })}
                        className="h-4 w-4 accent-ink"
                      />
                      <span className="text-[13.5px] font-semibold text-ink">
                        {FIELD_LABELS[field.field] ?? field.field}
                      </span>
                    </label>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
                        style.className,
                      )}
                    >
                      {style.label}
                    </span>
                    {field.start != null && (
                      <button
                        type="button"
                        onClick={() => onSeek(field.start as number)}
                        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:border-ink/30 hover:text-ink"
                        title="Play this moment of the brief"
                      >
                        <Play className="h-2.5 w-2.5" />
                        {timecode(field.start)}
                      </button>
                    )}
                  </div>

                  {isList ? (
                    row.values.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.values.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink"
                          >
                            {field.field === 'languages' && (
                              <span aria-hidden>{languageFlag(item)}</span>
                            )}
                            {field.field === 'languages' ? languageName(item) : item}
                            <button
                              type="button"
                              aria-label={`Remove ${item}`}
                              onClick={() =>
                                update(field.field, { values: row.values.filter((v) => v !== item) })
                              }
                              className="flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-ink/10 hover:text-ink"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-muted">Not in the brief — add it in the form.</p>
                    )
                  ) : long ? (
                    <textarea
                      rows={3}
                      value={row.value}
                      placeholder={field.status === 'missing' ? 'Not in the brief — complete it here or later' : ''}
                      onChange={(event) =>
                        update(field.field, { value: event.target.value, include: Boolean(event.target.value.trim()) || row.include })
                      }
                      className="w-full rounded-btn border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted/70 focus:border-ink/30 focus:bg-card"
                    />
                  ) : (
                    <input
                      value={row.value}
                      placeholder={field.status === 'missing' ? 'Not in the brief — complete it here or later' : ''}
                      onChange={(event) =>
                        update(field.field, { value: event.target.value, include: Boolean(event.target.value.trim()) || row.include })
                      }
                      className="w-full rounded-btn border border-line bg-paper px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted/70 focus:border-ink/30 focus:bg-card"
                    />
                  )}

                  {field.quote && (
                    <p className="text-[12px] italic leading-snug text-muted">“{field.quote}”</p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {(extraction.transcript?.length ?? 0) > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((open) => !open)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showTranscript && 'rotate-180')} />
            Transcript
          </button>
          {showTranscript && (
            <ol className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-field border border-line bg-card p-3">
              {(extraction.transcript ?? []).map((segment, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => onSeek(segment.start)}
                    className="flex gap-2.5 text-left text-[13px] leading-snug text-ink/90 hover:text-ink"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted">{timecode(segment.start)}</span>
                    {segment.text}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[12.5px] text-muted">
          {included} {included === 1 ? 'field' : 'fields'} selected
        </span>
        <Button onClick={apply} disabled={included === 0}>
          Apply to the {extraction.target === 'project' ? 'casting' : 'role'}
        </Button>
      </div>
    </div>
  )
}
