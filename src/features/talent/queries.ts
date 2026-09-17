import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addTalentSkill,
  createCredit,
  createTraining,
  deleteCredit,
  deleteTraining,
  getTalentProfileFull,
  listLanguages,
  listSkills,
  removeTalentSkill,
  setTalentLanguages,
  setTalentSkillLevel,
  updateCredit,
  updateTraining,
  type CreditInput,
  type TalentProfileFull,
  type TrainingInput,
} from '@/data/repositories/talent'
import {
  deleteMedia,
  listMedia,
  updateMedia,
  uploadMedia,
  urlForAsset,
} from '@/data/repositories/media'
import {
  updateProfile,
  upsertTalentProfile,
  type ProfilePatch,
  type TalentProfilePatch,
} from '@/data/repositories/profiles'
import type { MediaAssetRow, MediaKind } from '@/types/database'

/**
 * Talent data hooks. Components use these — never the repositories directly —
 * so loading/error states and cache invalidation are handled in one place.
 *
 * Everything hangs off one query key per talent: any mutation invalidates it and
 * the whole profile re-reads from Postgres. Simple, and it guarantees the UI
 * shows what the database actually holds (no optimistic drift).
 */

export const talentProfileKey = (profileId: string | undefined) => ['talent-profile', profileId]

export function useTalentProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: talentProfileKey(profileId),
    queryFn: () => getTalentProfileFull(profileId as string),
    enabled: Boolean(profileId),
  })
}

function useInvalidateTalent(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: talentProfileKey(profileId) })
    // The shells read the avatar and the name from the auth profile.
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }
}

export function useSkillsCatalog() {
  return useQuery({ queryKey: ['skills-catalog'], queryFn: listSkills, staleTime: 5 * 60_000 })
}

export function useLanguagesCatalog() {
  return useQuery({ queryKey: ['languages-catalog'], queryFn: listLanguages, staleTime: 5 * 60_000 })
}

// ── Profile writes ───────────────────────────────────────────────────────────

export function useUpdateAccountProfile(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)
  return useMutation({
    mutationFn: (patch: ProfilePatch) => updateProfile(profileId as string, patch),
    onSuccess: invalidate,
  })
}

export function useUpdateTalentProfile(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)
  return useMutation({
    mutationFn: (patch: TalentProfilePatch) => upsertTalentProfile(profileId as string, patch),
    onSuccess: invalidate,
  })
}

// ── Skills & languages ───────────────────────────────────────────────────────

export function useTalentSkillMutations(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)

  const add = useMutation({
    mutationFn: ({ name, level }: { name: string; level?: 1 | 2 | 3 }) =>
      addTalentSkill(profileId as string, name, level),
    onSuccess: invalidate,
  })

  const setLevel = useMutation({
    mutationFn: ({ skillId, level }: { skillId: string; level: 1 | 2 | 3 }) =>
      setTalentSkillLevel(profileId as string, skillId, level),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (skillId: string) => removeTalentSkill(profileId as string, skillId),
    onSuccess: invalidate,
  })

  return { add, setLevel, remove }
}

export function useSetTalentLanguages(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)
  return useMutation({
    mutationFn: (codes: string[]) => setTalentLanguages(profileId as string, codes),
    onSuccess: invalidate,
  })
}

// ── Credits & training ───────────────────────────────────────────────────────

export function useCreditMutations(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)

  const create = useMutation({
    mutationFn: (input: CreditInput) => createCredit(profileId as string, input),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreditInput> }) =>
      updateCredit(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteCredit, onSuccess: invalidate })

  return { create, update, remove }
}

export function useTrainingMutations(profileId: string | undefined) {
  const invalidate = useInvalidateTalent(profileId)

  const create = useMutation({
    mutationFn: (input: TrainingInput) => createTraining(profileId as string, input),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TrainingInput> }) =>
      updateTraining(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteTraining, onSuccess: invalidate })

  return { create, update, remove }
}

// ── Media ────────────────────────────────────────────────────────────────────

export function useMedia(profileId: string | undefined, kinds?: MediaKind[]) {
  return useQuery({
    queryKey: ['media', profileId, kinds?.join(',') ?? 'all'],
    queryFn: () => listMedia(profileId as string, kinds),
    enabled: Boolean(profileId),
  })
}

export function useMediaMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: talentProfileKey(profileId) })
    void queryClient.invalidateQueries({ queryKey: ['media', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }

  const upload = useMutation({
    mutationFn: (input: {
      kind: MediaKind
      file: File
      caption?: string | null
      onProgress?: (percent: number) => void
    }) => uploadMedia({ ownerId: profileId as string, ...input }),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<MediaAssetRow, 'caption' | 'sort_order' | 'kind'>>
    }) => updateMedia(id, patch),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (asset: MediaAssetRow) => deleteMedia(asset),
    onSuccess: invalidate,
  })

  return { upload, update, remove }
}

/** Public or signed URL of an asset, resolved asynchronously for self-tapes. */
export function useAssetUrl(asset: MediaAssetRow | null | undefined) {
  return useQuery({
    queryKey: ['asset-url', asset?.id],
    queryFn: () => urlForAsset(asset as MediaAssetRow),
    enabled: Boolean(asset),
    staleTime: 30 * 60_000,
  })
}

export type { TalentProfileFull }
