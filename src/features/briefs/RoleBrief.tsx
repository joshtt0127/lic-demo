import { useState } from 'react'
import { Play, X } from 'lucide-react'
import { useT } from '@/lib/i18n'

/**
 * Le Role Brief Video™ côté talent : replié par défaut (la fiche reste
 * lisible), ouvert d'un geste — « la vidéo ne doit pas devenir un obstacle
 * avant de postuler ».
 */
export function RoleBrief({ url }: { url: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return open ? (
    <div className="mt-3 flex max-w-2xl flex-col gap-2">
      <video src={url} controls autoPlay playsInline className="aspect-video w-full rounded-field bg-ink object-contain" />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-muted hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
        {t('brief.role.hide')}
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-ink/90"
    >
      <Play className="h-3.5 w-3.5" />
      {t('brief.role.watch')}
    </button>
  )
}
