/**
 * Tiny className combiner — joins truthy class fragments with a space.
 * Kept dependency-free on purpose (no clsx/tailwind-merge) for the demo.
 */
type ClassValue = string | false | null | undefined | ClassValue[]

export function cn(...parts: ClassValue[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    out.push(Array.isArray(part) ? cn(...part) : part)
  }
  return out.filter(Boolean).join(' ')
}
