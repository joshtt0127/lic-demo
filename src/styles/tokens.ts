/**
 * Let It Cast — design tokens (single source of truth).
 *
 * These mirror the Tailwind theme in `tailwind.config.js`. Use Tailwind classes
 * in JSX whenever possible; import from here only where raw values are needed
 * (recharts colors, inline SVG fills, framer-motion, canvas, etc.).
 */

export const colors = {
  // Surfaces
  paper: '#F6F5F1',
  card: '#FFFFFF',
  line: '#ECEAE4',

  // Text
  ink: '#15140F',
  muted: '#6E6A60',

  // Premium / brand accents
  cream: '#F1E4C3',
  gold: '#F2C200',

  // Signal / rating system
  signalNo: '#E0483D',
  signalMaybe: '#F4B400',
  signalGood: '#2BA36B',
  signalGoodBg: '#E7F6EE',

  // Match score + links
  match: '#16A34A',
  link: '#2563EB',

  // Brand mark squares
  brandYellow: '#F2C200',
  brandBlue: '#2563EB',
  brandRed: '#E0483D',
} as const

export const radii = {
  card: 24,
  btn: 16,
  field: 18,
  panel: 36,
  inner: 12,
  pill: 9999,
} as const

export const fonts = {
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const

/** Convenience map for the signal/rating system. */
export const signal = {
  no: { label: 'No go', color: colors.signalNo },
  maybe: { label: 'Maybe', color: colors.signalMaybe },
  good: { label: 'Good match', color: colors.signalGood, bg: colors.signalGoodBg },
} as const

export type SignalKey = keyof typeof signal
