import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteBrief,
  extractBrief,
  linkExtraction,
  listProjectBriefs,
  saveBrief,
  setBriefVisibility,
  type BriefInput,
} from '@/data/repositories/briefs'
import type { BriefVisibility } from '@/types/database'

export const projectBriefsKey = (projectId: string | null | undefined) => ['project-briefs', projectId]

/** Le Video Casting Breakdown™ d'un projet, tel que ce compte a le droit de le voir. */
export function useProjectBriefs(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectBriefsKey(projectId),
    queryFn: () => listProjectBriefs(projectId as string),
    enabled: Boolean(projectId),
  })
}

export function useBriefMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['project-briefs'] })

  const save = useMutation({
    mutationFn: async (input: BriefInput & { extractionId?: string | null }) => {
      const brief = await saveBrief(input)
      if (input.extractionId) await linkExtraction(input.extractionId, brief.id).catch(() => {})
      return brief
    },
    onSuccess: invalidate,
  })
  const visibility = useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: BriefVisibility }) =>
      setBriefVisibility(id, visibility),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteBrief, onSuccess: invalidate })
  const extract = useMutation({ mutationFn: extractBrief })

  return { save, visibility, remove, extract }
}
