import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPost,
  deletePost,
  listPosts,
  listPostsByAuthor,
  setLike,
  suggestedProfiles,
} from '@/data/repositories/posts'

/**
 * Les publications du réseau.
 *
 * `useNetworkPosts` prend la liste des personnes suivies : passer une liste
 * vide veut dire « tout le monde », ce qui est ce qu'il faut montrer à un
 * compte qui ne suit encore personne — un fil vide ne donne envie de suivre
 * personne.
 */
export function useNetworkPosts(viewerId: string | undefined, authorIds: string[]) {
  const key = [...authorIds].sort().join(',')
  return useQuery({
    queryKey: ['posts', viewerId, key],
    queryFn: () => listPosts({ viewerId: viewerId as string, authorIds }),
    enabled: Boolean(viewerId),
  })
}

export function useAuthorPosts(authorId: string | undefined, viewerId: string | undefined) {
  return useQuery({
    queryKey: ['posts-by-author', authorId, viewerId],
    queryFn: () => listPostsByAuthor(authorId as string, viewerId as string),
    enabled: Boolean(authorId && viewerId),
  })
}

export function useSuggestedProfiles(viewerId: string | undefined) {
  return useQuery({
    queryKey: ['suggested-profiles', viewerId],
    queryFn: () => suggestedProfiles(viewerId as string),
    enabled: Boolean(viewerId),
  })
}

export function usePostMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['posts'] })
    void queryClient.invalidateQueries({ queryKey: ['posts-by-author'] })
  }

  const publish = useMutation({
    mutationFn: (input: { body: string; mediaAssetId?: string | null }) =>
      createPost({ authorId: profileId as string, ...input }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: invalidate,
  })

  const like = useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      setLike(postId, profileId as string, liked),
    onSuccess: invalidate,
  })

  return { publish, remove, like }
}
