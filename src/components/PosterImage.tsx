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
}: {
  src: string | undefined
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
}) {
  if (!src) return null
  return (
    <span className={cn('relative block h-full w-full overflow-hidden bg-ink/5', className)}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={loading}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl"
      />
      <img src={src} alt={alt} loading={loading} className="relative h-full w-full object-contain" />
    </span>
  )
}
