import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, FileText, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { sidesDownloadUrl } from './sides'

/**
 * Les Audition Sides™ lues **dans** Let It Cast, en plein écran.
 *
 * Le PDF est dessiné page par page avec pdf.js plutôt que confié au lecteur du
 * navigateur : dans une iframe, Chrome Android propose un téléchargement et
 * Safari iOS n'affiche que la première page. pdf.js n'est chargé qu'à
 * l'ouverture — la page casting ne le paie pas.
 */
export function SidesViewer({
  url,
  roleName,
  onClose,
}: {
  url: string
  roleName: string
  onClose: () => void
}) {
  const t = useT()
  const pagesRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pageCount, setPageCount] = useState(0)

  // Esc ferme, la page derrière ne défile plus, le focus va sur « fermer ».
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    let destroy: (() => void) | null = null

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const task = pdfjs.getDocument({ url })
        destroy = () => void task.destroy()
        const pdf = await task.promise
        if (cancelled) return
        setPageCount(pdf.numPages)
        setStatus('ready')

        const container = pagesRef.current
        if (!container) return
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let number = 1; number <= pdf.numPages; number++) {
          if (cancelled) return
          const page = await pdf.getPage(number)
          const width = Math.min(container.clientWidth, 920)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${width}px`
          canvas.setAttribute('aria-label', t('sides.page', { number, total: pdf.numPages }))
          canvas.setAttribute('role', 'img')
          canvas.className = 'mx-auto block max-w-full rounded-[6px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.5)]'
          container.appendChild(canvas)
          await page.render({ canvas, viewport }).promise
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
      if (pagesRef.current) pagesRef.current.innerHTML = ''
    }
  }, [url, t])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('sides.viewerTitle', { name: roleName })}
      className="fixed inset-0 z-[100] flex flex-col bg-[#0d0c09]/95 text-white backdrop-blur-sm"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inner bg-white/10">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-semibold uppercase tracking-label text-white/55">
            {t('sides.badge')}
          </p>
          <p className="truncate font-display text-[16px] font-bold sm:text-[18px]">
            {roleName}
            {pageCount > 0 && (
              <span className="ml-2 font-sans text-[13px] font-medium text-white/50">
                {t('sides.pages', { count: pageCount })}
              </span>
            )}
          </p>
        </div>
        <a
          href={sidesDownloadUrl(url, roleName)}
          className="inline-flex h-10 items-center gap-2 rounded-btn bg-white px-3.5 text-[13px] font-bold text-ink transition hover:brightness-95"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t('sides.download')}</span>
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-btn text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-10">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
        {status === 'error' && (
          <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="text-[15px] text-white/80">{t('sides.previewError')}</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-4 text-[14px] font-bold text-ink"
            >
              <ExternalLink className="h-4 w-4" />
              {t('sides.openPdf')}
            </a>
          </div>
        )}
        <div ref={pagesRef} className="mx-auto flex w-full max-w-[920px] flex-col gap-6" />
      </div>
    </div>,
    document.body,
  )
}
