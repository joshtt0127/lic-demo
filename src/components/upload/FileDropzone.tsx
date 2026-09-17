import { useRef, useState, type ReactNode } from 'react'
import { UploadCloud } from 'lucide-react'
import { RULES, validateFile } from '@/lib/storage'
import { cn } from '@/lib/cn'
import type { MediaKind } from '@/types/database'

/**
 * Drag & drop + file picker, with client-side validation before anything is
 * sent. Presentational on purpose: the caller owns the upload itself.
 */
export function FileDropzone({
  kind,
  onFile,
  onError,
  disabled,
  compact,
  fill,
  bare,
  label,
  children,
  className,
}: {
  kind: MediaKind
  onFile: (file: File) => void
  onError?: (message: string) => void
  disabled?: boolean
  compact?: boolean
  /** Fill the parent box (used as a tile inside a media grid). */
  fill?: boolean
  /** No frame and no padding — for a bare icon trigger (avatar, cover). */
  bare?: boolean
  label?: string
  /** Custom inner content (used by the gallery "add" tile). */
  children?: ReactNode
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const invalid = validateFile(file, kind)
    if (invalid) {
      onError?.(invalid)
      return
    }
    onFile(file)
  }

  return (
    <div
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
      className={className}
    >
      <input
        ref={inputRef}
        type="file"
        accept={RULES[kind].mimes.join(',')}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center text-center transition-colors',
          !bare && 'w-full gap-2 rounded-card border border-dashed',
          !bare && (fill ? 'h-full px-3 py-3' : compact ? 'px-3 py-5' : 'px-6 py-9'),
          !bare && (dragging ? 'border-ink bg-cream/40' : 'border-line bg-paper hover:border-ink/30'),
          bare && dragging && 'scale-110',
          disabled && 'opacity-60',
        )}
      >
        {children ?? (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-card">
              <UploadCloud className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-semibold text-ink">
              {label ?? 'Drop a file or click to browse'}
            </span>
            <span className="text-xs text-muted">{RULES[kind].label}</span>
          </>
        )}
      </button>
    </div>
  )
}

/** Thin progress bar shown during an upload. */
export function UploadProgress({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-9 shrink-0 font-mono text-[11px] text-muted">{percent}%</span>
    </div>
  )
}
