import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Every embedded read the app performs, run against the live schema with the
 * public anon key.
 *
 * This exists because of a real outage: adding `saved_talents` gave PostgREST a
 * second path between `talent_profiles` and `profiles`, and the talent search
 * started answering "Could not embed because more than one relationship was
 * found". Embeds break from a *migration*, not from a code change, so they need
 * a test that talks to the real database.
 *
 * Any new table with two foreign keys onto an already-joined pair will fail
 * here first.
 */

async function signIn(email: string): Promise<SupabaseClient> {
  const env = localEnv()
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  expect(error, `sign in as ${email}`).toBeNull()
  return client
}

test('every embedded query the app relies on still resolves', async () => {
  const production = await signIn('peter@letitcast.demo')
  const talent = await signIn('maya@letitcast.demo')

  const { data: auth } = await production.auth.getUser()
  const productionId = auth.user!.id
  const { data: memberships } = await production
    .from('organization_members')
    .select('org_id')
    .eq('profile_id', productionId)
  const orgId = memberships?.[0]?.org_id
  expect(orgId, 'the demo production account belongs to an organization').toBeTruthy()

  const probes: [string, () => PromiseLike<{ error: unknown }>][] = [
    [
      'talent search',
      () =>
        production
          .from('talent_profiles')
          .select(
            `profile_id, headline, gender, playing_age_min, playing_age_max, experience_level,
             availability,
             profiles!talent_profiles_profile_id_fkey!inner (
               id, first_name, last_name, avatar_url, city, country, account_type
             ),
             talent_skills ( level, skills ( name ) ),
             talent_languages ( language, languages ( name ) )`,
          )
          .limit(5),
    ],
    [
      'organization members',
      () =>
        production
          .from('organization_members')
          .select('*, profiles ( id, first_name, last_name, avatar_url, city )')
          .eq('org_id', orgId as string),
    ],
    [
      'conversations and their members',
      () =>
        production
          .from('conversation_members')
          .select('conversation_id, profiles(id, first_name, last_name, avatar_url)')
          .limit(5),
    ],
    [
      'messages with their sender',
      () =>
        production
          .from('messages')
          .select('*, profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url)')
          .limit(5),
    ],
    [
      'reviews with their reviewer',
      () =>
        production
          .from('candidate_reviews')
          .select(
            '*, profiles!candidate_reviews_reviewer_id_fkey(id, first_name, last_name, avatar_url)',
          )
          .limit(5),
    ],
    [
      'notes with their author',
      () =>
        production
          .from('candidate_notes')
          .select(
            '*, profiles!candidate_notes_author_id_fkey(id, first_name, last_name, avatar_url)',
          )
          .limit(5),
    ],
    [
      'candidates view',
      () => production.from('v_candidates').select('*').limit(5),
    ],
    [
      'organization castings with project and roles',
      () =>
        production
          .from('casting_calls')
          .select(
            `*, projects ( id, title, production_type, company_name, poster_url, genre,
             shooting_start, shooting_end, shooting_location, synopsis ), roles (*)`,
          )
          .limit(5),
    ],
    [
      'self-tapes with their media asset',
      () => production.from('self_tapes').select('id, duration_s, media_assets ( id, bucket, path )').limit(3),
    ],
    [
      'invitations with their organization',
      () => production.from('organization_invites').select('*, organizations(*)').limit(5),
    ],
    [
      'my organizations',
      () =>
        production
          .from('organization_members')
          .select('role, status, organizations(*)')
          .eq('profile_id', productionId),
    ],
    [
      'talent: my applications',
      () =>
        talent
          .from('applications')
          .select(
            `*, roles ( id, name, role_type, selftape_instructions, casting_call_id,
             casting_calls ( id, title, deadline_at, location, status,
             projects ( id, title, poster_url, production_type ) ) ), self_tapes ( id )`,
          )
          .limit(5),
    ],
    [
      'talent: published castings',
      () =>
        talent
          .from('casting_calls')
          .select(
            `*, projects ( id, title, production_type, genre, company_name, poster_url, synopsis,
             director_name, shooting_location, shooting_start, shooting_end, director_brief ),
             roles (*)`,
          )
          .eq('status', 'published'),
    ],
    [
      'talent: skills and languages',
      () => talent.from('talent_skills').select('skill_id, level, skills(id, name, category)').limit(5),
    ],
  ]

  const failures: string[] = []
  for (const [name, run] of probes) {
    const { error } = await run()
    if (error) failures.push(`${name}: ${(error as { message?: string }).message ?? String(error)}`)
  }

  expect(failures, failures.join('\n')).toEqual([])
})
