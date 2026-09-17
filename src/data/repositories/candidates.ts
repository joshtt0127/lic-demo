import { supabase } from '@/lib/supabase'
import { signedUrl } from '@/lib/storage'
import type {
  ApplicationStatus,
  CandidateNoteRow,
  CandidateReviewRow,
  CandidateViewRow,
  MediaAssetRow,
  ProfileRow,
  ReviewVote,
} from '@/types/database'

/**
 * Production side: candidates.
 *
 * A "candidate" is not a separate entity — it is a row of `v_candidates`, i.e.
 * the very application the talent submitted, joined with their identity and the
 * team's votes. Same id on both sides of the marketplace.
 */

export async function listCandidatesForRoles(roleIds: string[]): Promise<CandidateViewRow[]> {
  if (roleIds.length === 0) return []
  const { data, error } = await supabase
    .from('v_candidates')
    .select('*')
    .in('role_id', roleIds)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listCandidatesForProject(projectId: string): Promise<CandidateViewRow[]> {
  const { data, error } = await supabase
    .from('v_candidates')
    .select('*')
    .eq('project_id', projectId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Marks an application as seen the first time a reviewer opens it. */
export async function markApplicationViewed(applicationId: string): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ status: 'viewed', viewed_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'submitted')
  if (error) throw error
}

export async function setApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({
      status,
      decided_at: ['shortlisted', 'callback', 'offer', 'cast', 'not_selected'].includes(status)
        ? new Date().toISOString()
        : null,
    })
    .eq('id', applicationId)
  if (error) throw error
}

// ── Team review ──────────────────────────────────────────────────────────────

export type ReviewWithReviewer = CandidateReviewRow & {
  reviewer: Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null
}

export async function listReviews(applicationId: string): Promise<ReviewWithReviewer[]> {
  const { data, error } = await supabase
    .from('candidate_reviews')
    .select('*, profiles!candidate_reviews_reviewer_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('application_id', applicationId)
  if (error) throw error

  type Joined = CandidateReviewRow & { profiles: ReviewWithReviewer['reviewer'] }
  return ((data ?? []) as unknown as Joined[]).map(({ profiles, ...review }) => ({
    ...review,
    reviewer: profiles,
  }))
}

export async function voteOnCandidate(input: {
  applicationId: string
  reviewerId: string
  vote: ReviewVote
  comment?: string | null
}): Promise<void> {
  const { error } = await supabase.from('candidate_reviews').upsert(
    {
      application_id: input.applicationId,
      reviewer_id: input.reviewerId,
      vote: input.vote,
      comment: input.comment ?? null,
    },
    { onConflict: 'application_id,reviewer_id' },
  )
  if (error) throw error
}

// ── Notes ────────────────────────────────────────────────────────────────────

export type NoteWithAuthor = CandidateNoteRow & {
  author: Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null
}

export async function listNotes(applicationId: string): Promise<NoteWithAuthor[]> {
  const { data, error } = await supabase
    .from('candidate_notes')
    .select('*, profiles!candidate_notes_author_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
  if (error) throw error

  type Joined = CandidateNoteRow & { profiles: NoteWithAuthor['author'] }
  return ((data ?? []) as unknown as Joined[]).map(({ profiles, ...note }) => ({
    ...note,
    author: profiles,
  }))
}

export async function addNote(input: {
  applicationId: string
  authorId: string
  body: string
}): Promise<void> {
  const { error } = await supabase.from('candidate_notes').insert({
    application_id: input.applicationId,
    author_id: input.authorId,
    body: input.body.trim(),
  })
  if (error) throw error
}

// ── Self-tape ────────────────────────────────────────────────────────────────

export type SelfTapeWithUrl = { id: string; url: string; durationSeconds: number | null }

/**
 * Self-tapes live in the private bucket: the URL is signed on demand, and the
 * storage policy only issues one to the owner or to a member of the reviewing
 * organization.
 */
export async function getSelfTape(applicationId: string): Promise<SelfTapeWithUrl | null> {
  const { data, error } = await supabase
    .from('self_tapes')
    .select('id, duration_s, media_assets ( id, bucket, path )')
    .eq('application_id', applicationId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  type Joined = { id: string; duration_s: number | null; media_assets: MediaAssetRow | null }
  const row = data as unknown as Joined
  if (!row.media_assets) return null

  return {
    id: row.id,
    url: await signedUrl(row.media_assets.bucket, row.media_assets.path),
    durationSeconds: row.duration_s,
  }
}
