import { useMemo, useRef, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { Input, type FieldSize } from '@/components/ui'
import { cn } from '@/lib/cn'

export type Option = { value: string; label: string }

/**
 * Searchable multi-select rendered as chips — languages, accents, ethnicities,
 * nationalities. `allowCreate` lets the user add a value that is not in the
 * catalogue (accents and nationalities are open lists by nature).
 */
export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = 'Search…',
  allowCreate,
  max,
  emptyLabel,
  fieldSize = 'md',
}: {
  options: Option[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  allowCreate?: boolean
  max?: number
  emptyLabel?: string
  fieldSize?: FieldSize
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const labelOf = useMemo(() => {
    const map = new Map(options.map((option) => [option.value, option.label]))
    return (value: string) => map.get(value) ?? value
  }, [options])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return options
      .filter((option) => !values.includes(option.value))
      .filter((option) => (needle ? option.label.toLowerCase().includes(needle) : true))
      .slice(0, 8)
  }, [options, query, values])

  const canCreate =
    allowCreate &&
    query.trim().length > 1 &&
    !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase()) &&
    !values.some((value) => value.toLowerCase() === query.trim().toLowerCase())

  const full = max !== undefined && values.length >= max

  function add(value: string) {
    if (full || values.includes(value)) return
    onChange([...values, value])
    setQuery('')
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div className="relative">
        <Input
          fieldSize={fieldSize}
          icon={<Search className={fieldSize === 'lg' ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (matches[0]) add(matches[0].value)
            else if (canCreate) add(query.trim())
          }}
          placeholder={full ? `Up to ${max} selected` : placeholder}
          disabled={full}
        />

        {open && (matches.length > 0 || canCreate) && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-btn border border-line bg-card shadow-card-hover">
            {matches.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(option.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-paper"
              >
                {option.label}
                <Check className="h-3.5 w-3.5 text-muted opacity-0" />
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
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

      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink"
            >
              {labelOf(value)}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                aria-label={`Remove ${labelOf(value)}`}
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-muted',
                  'transition-colors hover:bg-ink/10 hover:text-ink',
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        emptyLabel && <p className="text-xs text-muted">{emptyLabel}</p>
      )}
    </div>
  )
}
