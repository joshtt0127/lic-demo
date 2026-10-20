import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Image as ImageIcon, Monitor, Presentation, Printer, X } from 'lucide-react'
import { Button, Checkbox } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/cn'
import {
  canvasToBlob,
  downloadBlob,
  paginate,
  printPages,
  renderWall,
  type ExportCard,
  type ExportDocument,
  type WallTheme,
} from './render'

/**
 * Exporter le mur : une image haute définition, un fond d'écran, une version
 * à imprimer et épingler, ou une version de présentation pour l'extérieur
 * (réalisateurs, diffuseurs) qui masque tout ce qui est interne — chiffres
 * d'auditions, statuts, progression.
 *
 * L'aperçu est le vrai rendu, en petit : ce qu'on voit est ce qu'on exporte.
 */

type Output = 'image' | 'wallpaper' | 'print' | 'presentation'
type Paper = 'A4' | 'A3'
type Orientation = 'landscape' | 'portrait'

const WALLPAPERS = [
  { key: 'fhd', label: 'Full HD', width: 1920, height: 1080 },
  { key: 'qhd', label: 'QHD', width: 2560, height: 1440 },
  { key: '4k', label: '4K', width: 3840, height: 2160 },
] as const

const PAPER_MM: Record<Paper, { w: number; h: number }> = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 } }
const PRINT_DPI = 250
const IMAGE_WIDTH = 3200

export type ExportSource = {
  document: Omit<ExportDocument, 'cards' | 'scopeLabel' | 'progressLabel'>
  /** Cartes de tout le projet et de la catégorie affichée, dans l'ordre du mur. */
  all: { cards: ExportCard[]; progressLabel: string }
  current: { cards: ExportCard[]; progressLabel: string; label: string } | null
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export function ExportDialog({ source, onClose }: { source: ExportSource; onClose: () => void }) {
  const toast = useToast()
  const [output, setOutput] = useState<Output>('image')
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [wallpaper, setWallpaper] = useState<(typeof WALLPAPERS)[number]['key']>('qhd')
  const [paper, setPaper] = useState<Paper>('A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [theme, setTheme] = useState<WallTheme>('light')
  const [scope, setScope] = useState<'all' | 'current'>(source.current ? 'current' : 'all')
  const [includeEmpty, setIncludeEmpty] = useState(true)
  const [includeStats, setIncludeStats] = useState(false)
  const [footer, setFooter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const previewRef = useRef<HTMLDivElement>(null)

  const presentation = output === 'presentation'
  const stats = includeStats && !presentation

  // Le fond d'écran et la présentation se lisent mieux sur fond sombre.
  useEffect(() => {
    setTheme(output === 'wallpaper' || output === 'presentation' ? 'dark' : 'light')
  }, [output])

  const scoped = scope === 'current' && source.current ? source.current : { ...source.all, label: 'All Roles' }

  const doc = useMemo<ExportDocument>(() => {
    const cards = scoped.cards
      .filter((card) => includeEmpty || card.actorName)
      .map((card) => ({
        ...card,
        stats: stats ? card.stats : null,
        // Version de présentation : la composition du casting, sans le flux de travail.
        confirmed: presentation ? false : card.confirmed,
      }))
    return {
      ...source.document,
      cards,
      scopeLabel: scoped.label,
      progressLabel: presentation ? '' : scoped.progressLabel,
      exportedAt: new Date(),
    }
  }, [scoped, includeEmpty, stats, presentation, source.document])

  /** Taille finale du rendu, et taille minimale lisible d'un nom à cette échelle. */
  const target = useMemo(() => {
    if (output === 'wallpaper') {
      const preset = WALLPAPERS.find((item) => item.key === wallpaper)!
      return { width: preset.width, height: preset.height as number | null, minNamePx: (16 * preset.height) / 1080 }
    }
    if (output === 'presentation') return { width: 2560, height: 1440 as number | null, minNamePx: 21 }
    if (output === 'print') {
      const mm = PAPER_MM[paper]
      const [w, h] = orientation === 'landscape' ? [mm.w, mm.h] : [mm.h, mm.w]
      const px = (value: number) => Math.round((value / 25.4) * PRINT_DPI)
      // 8 points au minimum pour un nom imprimé.
      return { width: px(w), height: px(h) as number | null, minNamePx: (8 / 72) * PRINT_DPI }
    }
    return { width: IMAGE_WIDTH, height: null, minNamePx: 22 }
  }, [output, wallpaper, paper, orientation])

  /** Les pages à imprimer (une seule pour les autres sorties). */
  const pages = useMemo(() => {
    if (output !== 'print' || target.height == null) return [doc.cards]
    // Même calcul que le rendu : la zone de grille d'une page.
    const W = target.width
    const u = W / 100
    const margin = Math.round(W * 0.045)
    const gridTop = margin + Math.round(u * 6.2) + u * 2.2
    const area = { width: W - margin * 2, height: target.height - gridTop - margin - (footer ? Math.round(u * 3.2) : 0) }
    return paginate(doc.cards, area, { includeStats: stats, minNamePx: target.minNamePx })
  }, [output, target, doc.cards, footer, stats])

  // Aperçu : le vrai rendu, à petite échelle, recalculé quand un réglage change.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const previewWidth = 720
      const scale = previewWidth / target.width
      const { canvas, plan } = await renderWall(
        { ...doc, cards: pages[0] ?? [] },
        {
          width: previewWidth,
          height: target.height == null ? null : Math.round(target.height * scale),
          includeStats: stats,
          footer,
          theme,
          minNamePx: target.minNamePx * scale,
          pageLabel: pages.length > 1 ? `Page 1 of ${pages.length}` : undefined,
        },
      )
      if (cancelled) return
      canvas.className = 'h-auto w-full rounded-[14px] shadow-card'
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', 'Preview of the export')
      previewRef.current?.replaceChildren(canvas)
      setPageCount(pages.length)
      if (doc.cards.length === 0) setWarning('Nothing to export: every role in this view is still open. Include empty roles, or widen the scope.')
      else if (!plan.legible && output !== 'print')
        setWarning(
          output === 'image'
            ? 'Names will be small at this size.'
            : `${doc.cards.length} roles do not stay readable in one ${output === 'wallpaper' ? 'wallpaper' : 'slide'}. Export a single category (Lead Roles, Supporting Roles…) instead.`,
        )
      else setWarning(null)
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [doc, pages, target, stats, footer, theme, output])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function run() {
    setBusy(true)
    try {
      const base = `${slug(source.document.title)}-the-wall${scoped.label === 'All Roles' ? '' : `-${slug(scoped.label)}`}`
      if (output === 'print') {
        const canvases = []
        for (let index = 0; index < pages.length; index += 1) {
          const { canvas } = await renderWall(
            { ...doc, cards: pages[index] },
            {
              width: target.width,
              height: target.height,
              includeStats: stats,
              footer,
              theme: 'light',
              minNamePx: target.minNamePx,
              pageLabel: pages.length > 1 ? `Page ${index + 1} of ${pages.length}` : undefined,
            },
          )
          canvases.push(canvas)
        }
        await printPages(canvases, paper, orientation)
      } else {
        const { canvas } = await renderWall(doc, {
          width: target.width,
          height: target.height,
          includeStats: stats,
          footer,
          theme,
          minNamePx: target.minNamePx,
        })
        const jpeg = output === 'image' && format === 'jpeg'
        const blob = await canvasToBlob(canvas, jpeg ? 'image/jpeg' : 'image/png')
        const suffix =
          output === 'wallpaper' ? `-${target.width}x${target.height}` : output === 'presentation' ? '-presentation' : ''
        downloadBlob(blob, `${base}${suffix}.${jpeg ? 'jpg' : 'png'}`)
        toast(output === 'wallpaper' ? 'Wallpaper downloaded' : 'The Wall exported')
      }
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The export failed', <AlertTriangle className="h-4 w-4 text-signal-no" />)
    } finally {
      setBusy(false)
    }
  }

  const OUTPUTS: { key: Output; label: string; hint: string; icon: typeof ImageIcon }[] = [
    { key: 'image', label: 'Image', hint: 'High-resolution PNG or JPEG', icon: ImageIcon },
    { key: 'wallpaper', label: 'Wallpaper', hint: 'Full HD, QHD or 4K desktop', icon: Monitor },
    { key: 'print', label: 'Print', hint: 'A4 or A3, multi-page', icon: Printer },
    { key: 'presentation', label: 'Presentation', hint: 'For directors & studios', icon: Presentation },
  ]

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wall-export-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-[980px] flex-col overflow-hidden rounded-t-[28px] bg-card shadow-panel sm:rounded-panel"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="wall-export-title" className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-ink">
              Export The Wall™
            </h2>
            <p className="text-[12.5px] text-muted">Recomposed for the format you choose — never a screenshot.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-2 flex flex-col gap-3 bg-paper p-5 sm:p-6 lg:order-1">
            <div ref={previewRef} className="min-h-[200px]" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
              <span>
                {output === 'print'
                  ? `${paper} ${orientation} · ${pageCount} page${pageCount === 1 ? '' : 's'}`
                  : target.height
                    ? `${target.width} × ${target.height} px`
                    : `${target.width} px wide`}
              </span>
              <span>{doc.cards.length} role{doc.cards.length === 1 ? '' : 's'}</span>
            </div>
            {warning && (
              <p className="flex items-start gap-2 rounded-[14px] bg-signal-maybe/10 px-3 py-2.5 text-[12.5px] text-[#6B5300]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {warning}
              </p>
            )}
          </div>

          <div className="order-1 flex flex-col gap-5 p-5 sm:p-6 lg:order-2">
            <fieldset>
              <legend className="tech-label mb-2">Format</legend>
              <div className="grid grid-cols-2 gap-2">
                {OUTPUTS.map(({ key, label, hint, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={output === key}
                    onClick={() => setOutput(key)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-[16px] border p-3 text-left transition-colors',
                      output === key ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink hover:border-ink/25',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="text-[13.5px] font-semibold">{label}</span>
                    <span className={cn('text-[11px] leading-snug', output === key ? 'text-white/70' : 'text-muted')}>{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {output === 'image' && (
              <Choice
                legend="File type"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'png', label: 'PNG' },
                  { value: 'jpeg', label: 'JPEG' },
                ]}
              />
            )}
            {output === 'wallpaper' && (
              <Choice
                legend="Screen"
                value={wallpaper}
                onChange={setWallpaper}
                options={WALLPAPERS.map((item) => ({ value: item.key, label: item.label, hint: `${item.width}×${item.height}` }))}
              />
            )}
            {output === 'print' && (
              <>
                <Choice legend="Paper" value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
                <Choice
                  legend="Orientation"
                  value={orientation}
                  onChange={setOrientation}
                  options={[
                    { value: 'landscape', label: 'Landscape' },
                    { value: 'portrait', label: 'Portrait' },
                  ]}
                />
              </>
            )}
            {(output === 'image' || output === 'wallpaper') && (
              <Choice
                legend="Background"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Paper' },
                  { value: 'dark', label: 'Ink' },
                ]}
              />
            )}

            {source.current && (
              <Choice
                legend="Roles"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'all', label: 'All roles' },
                  { value: 'current', label: source.current.label },
                ]}
              />
            )}

            <fieldset className="flex flex-col gap-2.5">
              <legend className="tech-label mb-1">Include</legend>
              <Checkbox checked={includeEmpty} onChange={setIncludeEmpty} label="Empty roles" />
              {presentation ? (
                <p className="text-[13px] text-muted">Audition statistics are always left out here.</p>
              ) : (
                <Checkbox checked={includeStats} onChange={setIncludeStats} label="Audition statistics" />
              )}
              <Checkbox
                checked={footer}
                onChange={setFooter}
                label="Production footer (title, date, logo, credits)"
              />
            </fieldset>

            {presentation && (
              <p className="rounded-[14px] bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                The cast composition only: audition counts, ratings, casting status and progress are left out. Share it only with
                people cleared to see this production’s auditions.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6">
          <p className="hidden text-[12px] text-muted sm:block">Confidential — audition material of this production.</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="ghost" onClick={onClose} disabled={busy} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button
              onClick={run}
              disabled={busy || doc.cards.length === 0}
              icon={output === 'print' ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              className="flex-1 sm:flex-none"
            >
              {busy ? 'Preparing…' : output === 'print' ? 'Print' : output === 'wallpaper' ? 'Download wallpaper' : `Download ${output === 'image' ? format.toUpperCase() : 'PNG'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Choice<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string }[]
}) {
  return (
    <fieldset>
      <legend className="tech-label mb-2">{legend}</legend>
      <div className="inline-flex w-full gap-1 rounded-btn bg-paper p-1" role="radiogroup">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center rounded-inner px-2 py-1.5 text-[13px] font-semibold transition-colors',
              value === option.value ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <span className="truncate">{option.label}</span>
            {option.hint && <span className="font-mono text-[10px] font-normal text-muted">{option.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
