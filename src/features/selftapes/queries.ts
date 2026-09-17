import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSelfTape,
  listSelfTapes,
  removeSelfTape,
  selfTapeCounts,
  type SelfTape,
} from '@/data/repositories/selftapes'

/**
 * Self-tapes, both sides: the talent uploads and replaces, the production reads
 * the same rows. The signed URL expires, so these queries are short-lived on
 * purpose.
 */

export const selfTapesKey = (applicationId: string | undefined) => ['self-tapes', applicationId]

export function useSelfTapes(applicationId: string | undefined) {
  return useQuery({
    queryKey: selfTapesKey(applicationId),
    queryFn: () => listSelfTapes(applicationId as string),
    enabled: Boolean(applicationId),
    // The URLs are signed for an hour; refresh well before that.
    staleTime: 20 * 60_000,
  })
}

export function useSelfTapeCounts(applicationIds: string[]) {
  const key = [...applicationIds].sort().join(',')
  return useQuery({
    queryKey: ['self-tape-counts', key],
    queryFn: () => selfTapeCounts(applicationIds),
    enabled: applicationIds.length > 0,
  })
}

export function useSelfTapeMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()

  const invalidate = (applicationId: string) => {
    void queryClient.invalidateQueries({ queryKey: selfTapesKey(applicationId) })
    void queryClient.invalidateQueries({ queryKey: ['self-tape-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['my-applications', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['self-tape', applicationId] })
    void queryClient.invalidateQueries({ queryKey: ['candidates'] })
  }

  const upload = useMutation({
    mutationFn: ({
      applicationId,
      file,
      onProgress,
      replacing,
    }: {
      applicationId: string
      file: File
      onProgress?: (percent: number) => void
      /** Removed only once the new tape is safely in place. */
      replacing?: SelfTape | null
    }) =>
      addSelfTape({ applicationId, ownerId: profileId as string, file, onProgress }).then(
        async (tape) => {
          if (replacing) await removeSelfTape(replacing).catch(() => {})
          return tape
        },
      ),
    onSuccess: (tape) => invalidate(tape.applicationId),
  })

  const remove = useMutation({
    mutationFn: (tape: SelfTape) => removeSelfTape(tape),
    onSuccess: (_result, tape) => invalidate(tape.applicationId),
  })

  return { upload, remove }
}
