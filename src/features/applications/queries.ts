import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApplicationStatus } from '@/types/database'

/**
 * Application-side reads shared by both experiences. The full application flow
 * lands in `feat/applications`; these counters are already backed by the real
 * `applications` table, so they read 0 until the first submission — never a
 * decorative number.
 */

export type TalentApplicationStats = {
  total: number
  submitted: number
  shortlisted: number
  booked: number
}

const SUBMITTED: ApplicationStatus[] = [
  'submitted',
  'viewed',
  'under_review',
  'shortlisted',
  'callback',
  'offer',
  'cast',
  'not_selected',
]

const SHORTLISTED: ApplicationStatus[] = ['shortlisted', 'callback', 'offer', 'cast']

export async function getTalentApplicationStats(talentId: string): Promise<TalentApplicationStats> {
  const { data, error } = await supabase
    .from('applications')
    .select('status')
    .eq('talent_id', talentId)

  if (error) throw error

  const rows = data ?? []
  return {
    total: rows.length,
    submitted: rows.filter((row) => SUBMITTED.includes(row.status)).length,
    shortlisted: rows.filter((row) => SHORTLISTED.includes(row.status)).length,
    booked: rows.filter((row) => row.status === 'cast').length,
  }
}

export function useTalentApplicationStats(talentId: string | undefined) {
  return useQuery({
    queryKey: ['talent-application-stats', talentId],
    queryFn: () => getTalentApplicationStats(talentId as string),
    enabled: Boolean(talentId),
  })
}
