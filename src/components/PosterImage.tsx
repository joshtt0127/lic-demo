import { Clapperboard } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Une affiche, jamais rognée.
 *
 * Retour de test : les affiches étaient coupées partout (`object-cover`), au
 * point de perdre le titre ou les visages, surtout sur téléphone où le cadre
 * devient une bande pleine largeur. L'affiche s'affiche maintenant en entier
 * (`object-contain`), posée sur un fond fait d'elle-même, agrandie et floutée :
 * le cadre reste plein quel que soit le format de l'image.
 */
export function PosterImage({
  src,
  alt = '',
  className,
  loading,
  placeholder,
}: {
  src: string | undefined
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
  /** Sans affiche : un cadre neutre avec une icône, plutôt qu'un trou gris. */
  placeholder?: boolean
}) {
  if (!src) {
    if (!placeholder) return null
    return (
      <span className={cn('flex h-full w-full items-center justify-center bg-ink/5 text-muted/60', className)}>
        <Clapperboard className="h-6 w-6" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className={cn('relative block h-full w-full overflow-hidden bg-ink/5', className)}>
      {/* Le fond flou déborde de son propre cadre, jamais de celui de l'affiche. */}
      <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <img
          src={src}
          alt=""
          loading={loading}
          className="h-full w-full scale-110 object-cover opacity-70 blur-xl"
        />
      </span>
      <img src={src} alt={alt} loading={loading} className="relative h-full w-full object-contain" />
    </span>
  )
}
