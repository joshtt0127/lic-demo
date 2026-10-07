/** Un PDF qu'on peut afficher dans l'app — un ancien lien externe s'ouvre à part. */
export function isPdfSides(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf')
  } catch {
    return false
  }
}

/**
 * Le lien « Download PDF ». Le stockage Supabase sert le fichier en
 * pièce jointe quand on lui passe `?download=` — l'attribut `download` d'un
 * lien, lui, est ignoré d'une origine à l'autre.
 */
export function sidesDownloadUrl(url: string, roleName: string) {
  if (!url.includes('/storage/v1/object/public/')) return url
  const slug = roleName.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'role'
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}download=${encodeURIComponent(`${slug}-sides.pdf`)}`
}
