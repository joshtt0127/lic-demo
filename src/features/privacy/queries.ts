import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { removeFromBucket } from '@/lib/storage'
import { useAuth } from '@/features/auth/AuthProvider'

/**
 * Récupérer ses données, et partir.
 *
 * L'ordre compte pour l'effacement : les fichiers d'abord, la base ensuite.
 * Une ligne supprimée ne retire pas l'objet du stockage ; si on commençait par
 * la base, on perdrait la liste de ce qu'il fallait effacer et les vidéos
 * resteraient, orphelines.
 */

export function usePrivacyActions() {
  const { profile } = useAuth()

  const exportData = useMutation({
    mutationFn: async (): Promise<Blob> => {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    },
  })

  const deleteAccount = useMutation({
    mutationFn: async (reason?: string) => {
      // 1. Les fichiers, tant qu'on sait encore lesquels.
      const { data: media } = await supabase
        .from('media_assets')
        .select('bucket, path')
        .eq('owner_id', profile?.id as string)

      for (const asset of media ?? []) {
        await removeFromBucket(asset.bucket, asset.path).catch(() => {
          // Un fichier déjà parti ne doit pas empêcher quelqu'un de s'en aller.
        })
      }

      // 2. Le profil, anonymisé côté base, avec les faits laissés intacts.
      const { error } = await supabase.rpc('request_account_deletion', {
        p_reason: reason?.trim() || null,
      })
      if (error) throw error

      await supabase.auth.signOut()
    },
  })

  return { exportData, deleteAccount }
}
