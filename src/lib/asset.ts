/**
 * Resolve a media reference for display.
 *
 * Bundled demo files live in `public/` and need Vite's base URL (the app is also
 * served from a sub-path on GitHub Pages). Uploaded media comes back from
 * Supabase Storage as an absolute URL and must be left untouched — prefixing it
 * produced `/https://…` and a silently broken image.
 */
export const asset = (path: string | undefined): string | undefined => {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
