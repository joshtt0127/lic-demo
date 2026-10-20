/**
 * The Wall™ — rendu pour l'export.
 *
 * Le mur exporté n'est pas une capture d'écran : il est recomposé pour son
 * format. La grille est recalculée pour la taille demandée (une image haute
 * définition, un fond d'écran 4K, une page A3 à épingler), les textes
 * grandissent avec les cartes, les images des auditions sont recadrées sans
 * déformation, et rien de l'application (navigation, boutons, filtres) n'y
 * figure. Toute la mise en page est une fonction pure (`planGrid`, testée) ;
 * le dessin se fait sur un canvas.
 */

export type WallTheme = 'light' | 'dark'

export type ExportCard = {
  roleName: string
  actorName: string | null
  stillUrl: string | null
  stats: string | null
  confirmed: boolean
}

export type ExportDocument = {
  title: string
  /** « Feature film · Drama » */
  subtitle: string | null
  posterUrl: string | null
  logoUrl: string | null
  organizationName: string | null
  /** « Directed by … », « Casting by … » */
  credits: string[]
  scopeLabel: string
  progressLabel: string
  exportedAt: Date
  cards: ExportCard[]
}

export type RenderOptions = {
  width: number
  /** `null` : la hauteur suit le contenu (image haute définition). */
  height: number | null
  includeStats: boolean
  footer: boolean
  theme: WallTheme
  /** Taille minimale lisible du nom d'un comédien, en pixels du rendu. */
  minNamePx: number
  /** Page n / N pour l'impression. */
  pageLabel?: string
}

// Proportions d'une carte, exprimées pour une largeur de carte de 1.
const PAD = 0.05
const TITLE = 0.074
const NAME = 0.066
const STATS = 0.05
const IMAGE_RATIO = 1.25 // 4:5, comme à l'écran

/** Hauteur d'une carte pour une largeur de 1. */
export function cardHeightFactor(includeStats: boolean): number {
  const inner = 1 - 2 * PAD
  return PAD + TITLE * 1.3 + PAD * 0.7 + inner * IMAGE_RATIO + PAD * 0.7 + NAME * 1.35 + (includeStats ? STATS * 1.5 : 0) + PAD
}

export type GridPlan = {
  columns: number
  rows: number
  cardWidth: number
  cardHeight: number
  gap: number
  /** Le nom des comédiens reste-t-il lisible à cette taille ? */
  legible: boolean
  namePx: number
}

/**
 * La meilleure grille pour `count` cartes dans une zone donnée : le nombre de
 * colonnes qui donne les plus grandes cartes. Sans hauteur imposée, on vise
 * une composition équilibrée (jamais plus de 6 colonnes).
 */
export function planGrid(
  count: number,
  area: { width: number; height: number | null },
  options: { includeStats: boolean; minNamePx: number; gap?: number },
): GridPlan {
  const gap = options.gap ?? Math.round(area.width * 0.014)
  const factor = cardHeightFactor(options.includeStats)
  const n = Math.max(1, count)

  const evaluate = (columns: number) => {
    const rows = Math.ceil(n / columns)
    const byWidth = (area.width - (columns - 1) * gap) / columns
    const byHeight = area.height == null ? Infinity : (area.height - (rows - 1) * gap) / (rows * factor)
    return { columns, rows, cardWidth: Math.max(0, Math.min(byWidth, byHeight)) }
  }

  let best: { columns: number; rows: number; cardWidth: number }
  if (area.height == null) {
    const columns = n <= 4 ? n : n <= 8 ? 4 : n <= 15 ? 5 : 6
    best = evaluate(columns)
  } else {
    best = evaluate(1)
    for (let columns = 2; columns <= n; columns += 1) {
      const candidate = evaluate(columns)
      if (candidate.cardWidth > best.cardWidth + 0.5) best = candidate
    }
  }

  const namePx = best.cardWidth * NAME
  return {
    ...best,
    cardHeight: best.cardWidth * factor,
    gap,
    legible: namePx >= options.minNamePx,
    namePx,
  }
}

/**
 * Découpe les cartes en pages imprimables : autant de cartes par page que la
 * lisibilité le permet.
 */
export function paginate<T>(
  cards: T[],
  area: { width: number; height: number },
  options: { includeStats: boolean; minNamePx: number },
): T[][] {
  if (cards.length === 0) return [[]]
  let perPage = cards.length
  while (perPage > 1) {
    const plan = planGrid(perPage, area, options)
    if (plan.legible) break
    perPage -= 1
  }
  const pages: T[][] = []
  for (let index = 0; index < cards.length; index += perPage) pages.push(cards.slice(index, index + perPage))
  return pages
}

// ── Dessin ──────────────────────────────────────────────────────────────────

const COLORS = {
  light: { bg: '#F6F5F1', card: '#FFFFFF', ink: '#15140F', muted: '#67635A', line: '#E4E1D9', slot: '#F3F1EC', accent: '#F2C200' },
  dark: { bg: '#15140F', card: '#FFFFFF', ink: '#15140F', muted: '#67635A', line: '#3A3830', slot: '#F3F1EC', accent: '#F2C200' },
}

const DISPLAY = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", Inter, sans-serif'
const SANS = '"Inter Variable", Inter, system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, monospace'

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()

export function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  const cached = imageCache.get(url)
  if (cached) return cached
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    // Une image qui ne charge pas n'est remplacée par rien d'autre.
    image.onerror = () => resolve(null)
    image.src = url
  })
  imageCache.set(url, promise)
  return promise
}

async function ensureFonts() {
  if (!('fonts' in document)) return
  await Promise.all([
    document.fonts.load(`800 40px ${DISPLAY}`),
    document.fonts.load(`600 20px ${SANS}`),
    document.fonts.load(`400 20px ${MONO}`),
  ]).catch(() => {})
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath()
  context.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

/** Couvre la zone sans déformer : recadrage centré, un peu au-dessus du milieu. */
function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  const sx = (image.naturalWidth - sw) / 2
  const sy = Math.max(0, Math.min(image.naturalHeight - sh, (image.naturalHeight - sh) * 0.3))
  context.drawImage(image, sx, sy, sw, sh, x, y, w, h)
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 1 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1
  return `${text.slice(0, end).trimEnd()}…`
}

async function drawCard(
  context: CanvasRenderingContext2D,
  card: ExportCard,
  x: number,
  y: number,
  w: number,
  options: RenderOptions,
  colors: (typeof COLORS)['light'],
) {
  const pad = w * PAD
  const inner = w - 2 * pad
  const h = w * cardHeightFactor(options.includeStats)

  context.save()
  context.shadowColor = options.theme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(21,20,15,0.08)'
  context.shadowBlur = w * 0.05
  context.shadowOffsetY = w * 0.012
  context.fillStyle = colors.card
  roundRect(context, x, y, w, h, w * 0.075)
  context.fill()
  context.restore()

  let cursor = y + pad
  const titleSize = w * TITLE
  context.fillStyle = colors.ink
  context.font = `800 ${titleSize}px ${DISPLAY}`
  context.textBaseline = 'top'
  context.fillText(fitText(context, card.roleName, inner), x + pad, cursor)
  cursor += titleSize * 1.3 + pad * 0.7

  const imageH = inner * IMAGE_RATIO
  const radius = w * 0.05
  context.save()
  roundRect(context, x + pad, cursor, inner, imageH, radius)
  context.clip()
  const image = card.actorName ? await loadImage(card.stillUrl) : null
  if (image) {
    drawCover(context, image, x + pad, cursor, inner, imageH)
  } else {
    context.fillStyle = colors.slot
    context.fillRect(x + pad, cursor, inner, imageH)
  }
  context.restore()

  if (!card.actorName) {
    // Carte vide : un cadre en pointillés, rien d'autre qu'une décision à prendre.
    context.save()
    context.strokeStyle = 'rgba(21,20,15,0.18)'
    context.setLineDash([w * 0.025, w * 0.02])
    context.lineWidth = Math.max(1, w * 0.006)
    roundRect(context, x + pad, cursor, inner, imageH, radius)
    context.stroke()
    context.restore()
    context.fillStyle = colors.muted
    context.font = `600 ${w * 0.045}px ${SANS}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('TO BE CAST', x + w / 2, cursor + imageH / 2)
    context.textAlign = 'left'
    context.textBaseline = 'top'
  } else if (card.confirmed) {
    const label = 'CAST'
    context.font = `700 ${w * 0.04}px ${SANS}`
    const tw = context.measureText(label).width
    const bx = x + pad + w * 0.035
    const by = cursor + w * 0.035
    context.fillStyle = colors.accent
    roundRect(context, bx, by, tw + w * 0.06, w * 0.07, w * 0.035)
    context.fill()
    context.fillStyle = '#15140F'
    context.textBaseline = 'middle'
    context.fillText(label, bx + w * 0.03, by + w * 0.035)
    context.textBaseline = 'top'
  }
  cursor += imageH + pad * 0.7

  const nameSize = w * NAME
  context.font = `600 ${nameSize}px ${SANS}`
  context.fillStyle = card.actorName ? colors.ink : colors.muted
  context.fillText(fitText(context, card.actorName ?? 'Open role', inner), x + pad, cursor)
  cursor += nameSize * 1.35

  if (options.includeStats && card.stats) {
    context.font = `400 ${w * STATS}px ${MONO}`
    context.fillStyle = colors.muted
    context.fillText(fitText(context, card.stats, inner), x + pad, cursor)
  }
}

export async function renderWall(document_: ExportDocument, options: RenderOptions): Promise<{ canvas: HTMLCanvasElement; plan: GridPlan }> {
  await ensureFonts()
  const colors = COLORS[options.theme]
  const W = options.width
  const margin = Math.round(W * 0.045)
  const u = W / 100

  const headerH = Math.round(u * 6.2)
  const footerH = options.footer ? Math.round(u * 3.2) : 0
  const gridTop = margin + headerH + u * 2.2
  const area = {
    width: W - margin * 2,
    height: options.height == null ? null : options.height - gridTop - margin - footerH,
  }
  const plan = planGrid(document_.cards.length, area, {
    includeStats: options.includeStats,
    minNamePx: options.minNamePx,
  })
  const gridH = plan.rows * plan.cardHeight + (plan.rows - 1) * plan.gap
  const H = options.height ?? Math.ceil(gridTop + gridH + margin + footerH)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw the Wall')

  context.fillStyle = colors.bg
  context.fillRect(0, 0, W, H)
  const onBg = options.theme === 'dark' ? { ink: '#FFFFFF', muted: 'rgba(255,255,255,0.62)' } : { ink: colors.ink, muted: colors.muted }

  // ── En-tête : l'identité du projet, puis la progression ──
  let textX = margin
  const poster = await loadImage(document_.posterUrl)
  if (poster) {
    const ph = headerH
    const pw = ph * 0.7
    context.save()
    roundRect(context, margin, margin, pw, ph, u * 0.5)
    context.clip()
    drawCover(context, poster, margin, margin, pw, ph)
    context.restore()
    textX = margin + pw + u * 1.4
  }
  context.textBaseline = 'top'
  context.fillStyle = onBg.muted
  context.font = `600 ${u * 0.95}px ${SANS}`
  context.fillText(`THE WALL™ · ${document_.scopeLabel.toUpperCase()}`, textX, margin + u * 0.2)
  context.fillStyle = onBg.ink
  context.font = `800 ${u * 3}px ${DISPLAY}`
  const titleMax = W - textX - margin - u * 22
  context.fillText(fitText(context, document_.title, titleMax), textX, margin + u * 1.6)
  if (document_.subtitle) {
    context.fillStyle = onBg.muted
    context.font = `500 ${u * 1.15}px ${SANS}`
    context.fillText(fitText(context, document_.subtitle, titleMax), textX, margin + u * 4.9)
  }
  context.textAlign = 'right'
  context.fillStyle = onBg.ink
  context.font = `700 ${u * 1.5}px ${DISPLAY}`
  context.fillText(document_.progressLabel, W - margin, margin + u * 1.9)
  if (options.pageLabel) {
    context.fillStyle = onBg.muted
    context.font = `500 ${u * 0.95}px ${SANS}`
    context.fillText(options.pageLabel, W - margin, margin + u * 4.1)
  }
  context.textAlign = 'left'

  // ── La grille ──
  const gridW = plan.columns * plan.cardWidth + (plan.columns - 1) * plan.gap
  const offsetX = margin + (W - margin * 2 - gridW) / 2
  const availableH = (options.height ?? H) - gridTop - margin - footerH
  const offsetY = gridTop + Math.max(0, (availableH - gridH) / 2)
  for (let index = 0; index < document_.cards.length; index += 1) {
    const column = index % plan.columns
    const row = Math.floor(index / plan.columns)
    // La dernière ligne incomplète est centrée.
    const inRow = Math.min(plan.columns, document_.cards.length - row * plan.columns)
    const rowOffset = ((plan.columns - inRow) * (plan.cardWidth + plan.gap)) / 2
    await drawCard(
      context,
      document_.cards[index],
      offsetX + rowOffset + column * (plan.cardWidth + plan.gap),
      offsetY + row * (plan.cardHeight + plan.gap),
      plan.cardWidth,
      options,
      colors,
    )
  }

  // ── Pied : informations de production ──
  if (options.footer) {
    const y = H - margin - footerH + u * 1.2
    context.strokeStyle = options.theme === 'dark' ? 'rgba(255,255,255,0.14)' : colors.line
    context.lineWidth = Math.max(1, u * 0.06)
    context.beginPath()
    context.moveTo(margin, y - u * 0.9)
    context.lineTo(W - margin, y - u * 0.9)
    context.stroke()

    let footerX = margin
    const logo = await loadImage(document_.logoUrl)
    if (logo) {
      const lh = u * 1.6
      const lw = (logo.naturalWidth / logo.naturalHeight) * lh
      context.drawImage(logo, margin, y - u * 0.15, lw, lh)
      footerX += lw + u * 0.8
    }
    context.fillStyle = onBg.muted
    context.font = `500 ${u * 0.95}px ${SANS}`
    const left = [document_.title, document_.organizationName, ...document_.credits].filter(Boolean).join('  ·  ')
    context.fillText(fitText(context, left, W - footerX - margin - u * 20), footerX, y)
    context.textAlign = 'right'
    context.fillText(
      `Exported ${document_.exportedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Let It Cast · Confidential`,
      W - margin,
      y,
    )
    context.textAlign = 'left'
  }

  return { canvas, plan }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))), type, quality),
  )
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Imprime des pages rendues, sans rien de l'application, via un cadre caché. */
export async function printPages(pages: HTMLCanvasElement[], paper: 'A4' | 'A3', orientation: 'landscape' | 'portrait') {
  const urls = await Promise.all(pages.map(async (page) => URL.createObjectURL(await canvasToBlob(page, 'image/jpeg', 0.94))))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) throw new Error('Printing is not available in this browser')
  doc.open()
  doc.write(`<!doctype html><html><head><title>The Wall</title><style>
    @page { size: ${paper} ${orientation}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    img { width: 100%; height: 100%; object-fit: contain; }
  </style></head><body>${urls.map((url) => `<div class="page"><img src="${url}" alt=""></div>`).join('')}</body></html>`)
  doc.close()
  await Promise.all(
    Array.from(doc.images).map((image) =>
      image.complete ? Promise.resolve() : new Promise((resolve) => ((image.onload = resolve), (image.onerror = resolve))),
    ),
  )
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  setTimeout(() => {
    frame.remove()
    urls.forEach((url) => URL.revokeObjectURL(url))
  }, 60_000)
}
