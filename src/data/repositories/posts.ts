import { supabase } from '@/lib/supabase'
import { publicUrl } from '@/lib/storage'
import type { MediaAssetRow, ProfileRow } from '@/types/database'

/**
 * Les publications des membres — la partie « réseau » du fil.
 *
 * Une publication porte son auteur, son média éventuel et le compte de ses
 * likes. Tout est lu sur les lignes : aucun compteur stocké, donc rien qui
 * puisse diverger après une suppression.
 */

export type PostAuthor = Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'> & {
  headline: string | null
  professionalName: string | null
}

export type Post = {
  id: string
  body: string
  createdAt: string
  author: PostAuthor | null
  mediaUrl: string | null
  mediaKind: string | null
  likes: number
  likedByMe: boolean
}

type Joined = {
  id: string
  body: string
  created_at: string
  author_id: string
  media_assets: Pick<MediaAssetRow, 'bucket' | 'path' | 'kind'> | null
  profiles:
    | (Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'> & {
      })
    | null
}

/**
 * L'auteur d'une publication, sans ouvrir son profil.
 *
 * `talent_profiles` n'est plus lisible par tout le monde — c'est le correctif de
 * confidentialité : un comédien n'a pas à lire l'e-mail de l'agent d'un autre.
 * La carte du fil a pourtant besoin du nom professionnel et de l'accroche ; elle
 * les prend donc dans `v_talent_card`, une vue qui n'expose que ces deux
 * colonnes, en une requête pour toute la page plutôt qu'un embed par ligne.
 */
const SELECT = `
  id, body, created_at, author_id,
  media_assets ( bucket, path, kind ),
  profiles!posts_author_id_fkey ( id, first_name, last_name, avatar_url )
`

type TalentCard = { profile_id: string; professional_name: string | null; headline: string | null }

async function cardsFor(profileIds: string[]): Promise<Map<string, TalentCard>> {
  const unique = [...new Set(profileIds.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase
    .from('v_talent_card')
    .select('profile_id, professional_name, headline')
    .in('profile_id', unique)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.profile_id, row as TalentCard]))
}

function shape(
  row: Joined,
  likes: Map<string, number>,
  mine: Set<string>,
  cards: Map<string, TalentCard>,
): Post {
  const profile = row.profiles
  const card = profile ? cards.get(profile.id) : undefined
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: profile
      ? {
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          avatar_url: profile.avatar_url,
          headline: card?.headline ?? null,
          professionalName: card?.professional_name ?? null,
        }
      : null,
    mediaUrl: row.media_assets ? publicUrl(row.media_assets.bucket, row.media_assets.path) : null,
    mediaKind: row.media_assets?.kind ?? null,
    likes: likes.get(row.id) ?? 0,
    likedByMe: mine.has(row.id),
  }
}

/** Les likes de ces publications, en une requête pour tout le fil. */
async function likesFor(postIds: string[], viewerId: string) {
  if (postIds.length === 0) return { counts: new Map<string, number>(), mine: new Set<string>() }
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id, profile_id')
    .in('post_id', postIds)
  if (error) throw error

  const counts = new Map<string, number>()
  const mine = new Set<string>()
  for (const row of data ?? []) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1)
    if (row.profile_id === viewerId) mine.add(row.post_id)
  }
  return { counts, mine }
}

/**
 * Le fil social : ce que publient les gens que l'on suit, et soi-même.
 *
 * Passer `authorIds` vide rend les publications récentes de tout le monde —
 * c'est ce qui permet de découvrir quelqu'un avant de le suivre.
 */
export const POSTS_PAGE_SIZE = 20

export async function listPosts({
  viewerId,
  authorIds,
  limit = POSTS_PAGE_SIZE,
  before,
}: {
  viewerId: string
  authorIds?: string[]
  limit?: number
  /** Curseur de date : la page suivante commence avant cette publication. */
  before?: string | null
}): Promise<Post[]> {
  let query = supabase
    .from('posts')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (authorIds && authorIds.length > 0) query = query.in('author_id', authorIds)
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as Joined[]
  const [{ counts, mine }, cards] = await Promise.all([
    likesFor(
      rows.map((row) => row.id),
      viewerId,
    ),
    cardsFor(rows.map((row) => row.author_id)),
  ])
  return rows.map((row) => shape(row, counts, mine, cards))
}

export async function listPostsByAuthor(authorId: string, viewerId: string): Promise<Post[]> {
  return listPosts({ viewerId, authorIds: [authorId] })
}

export async function createPost(input: {
  authorId: string
  body: string
  mediaAssetId?: string | null
}): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    author_id: input.authorId,
    body: input.body.trim(),
    media_asset_id: input.mediaAssetId ?? null,
  })
  if (error) throw error
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}

export async function setLike(postId: string, profileId: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('profile_id', profileId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, profile_id: profileId })
  if (error) throw error
}

/**
 * « Des gens à suivre » — calculé, pas inventé : des comptes qui suivent les
 * mêmes productions que vous, et que vous ne suivez pas encore.
 */
export async function suggestedProfiles(viewerId: string, limit = 5): Promise<PostAuthor[]> {
  const { data: mine } = await supabase
    .from('organization_follows')
    .select('org_id')
    .eq('profile_id', viewerId)

  const orgIds = (mine ?? []).map((row) => row.org_id)
  if (orgIds.length === 0) return []

  const { data: peers } = await supabase
    .from('organization_follows')
    .select('profile_id')
    .in('org_id', orgIds)
    .neq('profile_id', viewerId)

  const { data: already } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewerId)

  const followed = new Set((already ?? []).map((row) => row.following_id))
  const candidates = [...new Set((peers ?? []).map((row) => row.profile_id))].filter(
    (id) => !followed.has(id),
  )
  if (candidates.length === 0) return []

  // Même raison que le fil : le profil complet n'est plus lisible, la carte l'est.
  const shortlist = candidates.slice(0, limit)
  const [{ data: profiles, error }, cards] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', shortlist),
    cardsFor(shortlist),
  ])
  if (error) throw error

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    avatar_url: profile.avatar_url,
    headline: cards.get(profile.id)?.headline ?? null,
    professionalName: cards.get(profile.id)?.professional_name ?? null,
  }))
}
