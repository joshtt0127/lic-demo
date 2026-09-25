import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Récupérer ses données, et partir.
 *
 * Le test tient surtout à la frontière : ce qui doit disparaître (le nom, la
 * photo, les données sensibles, les coordonnées d'agent, les publications, les
 * fichiers) et ce qui doit rester (les candidatures, les décisions, les faits).
 * Effacer l'histoire d'une production parce qu'un comédien s'en va serait
 * réécrire son passé.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw error
  return client
}

test('a talent takes their data with them, and leaving keeps the casting record', async () => {
  const stamp = Date.now()
  const talentEmail = `e2e.gdpr.talent.${stamp}@letitcast.dev`
  const prodEmail = `e2e.gdpr.prod.${stamp}@letitcast.dev`

  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Gaia', last_name: 'Ward' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Gaia',
      last_name: 'Ward',
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin.from('talent_profiles').upsert(
    {
      profile_id: talentId,
      professional_name: 'Gaia Ward',
      playing_age_min: 25,
      playing_age_max: 35,
      agent_email: 'agent@example.com',
      ethnicities: ['white'],
    },
    { onConflict: 'profile_id' },
  )

  const { data: prod } = await admin.auth.admin.createUser({
    email: prodEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Remi', last_name: 'Ward' },
  })
  const prodId = prod!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', prodId)
  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Record Films ${stamp}`,
      slug: `record-films-${stamp}`,
      created_by: prodId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: prodId, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: prodId, title: `Kept Record ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: prodId,
      title: `Kept Record ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Part ${stamp}` })
    .select('id')
    .single()
  const { data: application } = await admin
    .from('applications')
    .insert({
      role_id: role!.id,
      talent_id: talentId,
      status: 'shortlisted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const talent = await signedIn(talentEmail)
  const { data: post } = await talent
    .from('posts')
    .insert({ author_id: talentId, body: `Leaving soon ${stamp}` })
    .select('id')
    .single()
  await talent.from('consents').insert({ profile_id: talentId, kind: 'terms', version: '2026-09' })

  // ── L'export rend ce qu'on a, pas ce qu'on croit ──
  const { data: exported, error: exportError } = await talent.rpc('export_my_data')
  expect(exportError).toBeNull()
  const dump = exported as Record<string, unknown>
  expect(Object.keys(dump), 'the export covers every family of data').toEqual(
    expect.arrayContaining([
      'profile',
      'talent_profile',
      'consents',
      'applications',
      'self_tapes',
      'media',
      'posts',
      'messages_sent',
      'events_about_me',
    ]),
  )
  expect((dump.applications as unknown[]).length, 'including their applications').toBe(1)
  expect((dump.consents as unknown[]).length, 'and what they accepted').toBe(1)

  // ── Partir ──
  const { error: deleted } = await talent.rpc('request_account_deletion', {
    p_reason: 'Leaving the profession.',
  })
  expect(deleted).toBeNull()

  // Ce qui disparaît.
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, avatar_url, city, suspended_at')
    .eq('id', talentId)
    .single()
  expect(profile?.first_name, 'the name is gone').toBe('Deleted')
  expect(profile?.avatar_url, 'the photo too').toBeNull()
  expect(profile?.city).toBeNull()
  expect(profile?.suspended_at, 'and the account can no longer act').not.toBeNull()

  const { data: sensitive } = await admin
    .from('talent_profiles')
    .select('agent_email, ethnicities, professional_name')
    .eq('profile_id', talentId)
    .single()
  expect(sensitive?.agent_email, 'agent contact erased').toBeNull()
  expect(sensitive?.ethnicities, 'sensitive data erased').toEqual([])
  expect(sensitive?.professional_name).toBeNull()

  const { data: posts } = await admin.from('posts').select('id').eq('id', post!.id)
  expect(posts ?? [], 'their public posts are gone').toHaveLength(0)

  // Ce qui reste : l'archive de la production.
  const { data: keptApplication } = await admin
    .from('applications')
    .select('status')
    .eq('id', application!.id)
    .single()
  expect(keptApplication?.status, 'the application stays, with its decision').toBe('shortlisted')

  const { data: keptEvents } = await admin
    .from('events')
    .select('type')
    .eq('subject_id', talentId)
  expect((keptEvents ?? []).length, 'and the facts stay too').toBeGreaterThan(0)

  const { data: request } = await admin
    .from('deletion_requests')
    .select('reason, completed_at')
    .eq('profile_id', talentId)
    .single()
  expect(request?.reason, 'the request is recorded for LIC to finish').toContain('Leaving')
  expect(request?.completed_at, 'and is not closed by the app itself').toBeNull()

  await talent.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [talentId, prodId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
