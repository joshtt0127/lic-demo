import { useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Input, Spinner } from '@/components/ui'
import { SegmentedControl } from '@/components/form/SegmentedControl'
import type { SkillRow } from '@/types/database'
import type { TalentSkill } from '@/data/repositories/talent'

export const SKILL_LEVELS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Training' },
  { value: 2, label: 'Proficient' },
  { value: 3, label: 'Expert' },
]

/**
 * Skills with a proficiency level — what productions actually filter on. The
 * catalogue is suggested, but a talent can add a skill that is not in it (the
 * repository creates the canonical row).
 */
export function SkillPicker({
  catalogue,
  skills,
  onAdd,
  onLevelChange,
  onRemove,
  busy,
}: {
  catalogue: SkillRow[]
  skills: TalentSkill[]
  onAdd: (name: string) => void
  onLevelChange: (skillId: string, level: 1 | 2 | 3) => void
  onRemove: (skillId: string) => void
  busy?: boolean
}) {
  const [query, setQuery] = useState('')

  const selectedNames = useMemo(
    () => new Set(skills.map((skill) => skill.name.toLowerCase())),
    [skills],
  )

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return catalogue
      .filter((skill) => !selectedNames.has(skill.name.toLowerCase()))
      .filter((skill) => (needle ? skill.name.toLowerCase().includes(needle) : false))
      .slice(0, 6)
  }, [catalogue, query, selectedNames])

  const canCreate =
    query.trim().length > 1 &&
    !catalogue.some((skill) => skill.name.toLowerCase() === query.trim().toLowerCase()) &&
    !selectedNames.has(query.trim().toLowerCase())

  function add(name: string) {
    onAdd(name)
    setQuery('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Search a skill — acting, singing, horse riding…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (suggestions[0]) add(suggestions[0].name)
            else if (canCreate) add(query.trim())
          }}
        />

        {(suggestions.length > 0 || canCreate) && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-btn border border-line bg-card shadow-card-hover">
            {suggestions.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => add(skill.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-paper"
              >
                {skill.name}
                {skill.category && (
                  <span className="text-[11px] uppercase tracking-label text-muted">
                    {skill.category}
                  </span>
                )}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={() => add(query.trim())}
                className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-paper"
              >
                <Plus className="h-3.5 w-3.5" />
                Add “{query.trim()}”
              </button>
            )}
          </div>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-muted">
          No skills yet. Three or more makes your profile far easier to find.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-card">
          {skills.map((skill) => (
            <li key={skill.skillId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex-1 text-sm font-semibold text-ink">{skill.name}</span>
              <SegmentedControl
                size="sm"
                options={SKILL_LEVELS.map((level) => ({
                  value: String(level.value),
                  label: level.label,
                }))}
                value={String(skill.level)}
                onChange={(value) =>
                  value && onLevelChange(skill.skillId, Number(value) as 1 | 2 | 3)
                }
              />
              <button
                type="button"
                onClick={() => onRemove(skill.skillId)}
                aria-label={`Remove ${skill.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy && (
        <span className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3.5 w-3.5" />
          Saving…
        </span>
      )}
    </div>
  )
}
