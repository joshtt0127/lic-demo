import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Une annonce qui change, et une annonce qui se ferme.
 *
 * Deux moments où des gens qui ont candidaté apprenaient la nouvelle… jamais.
 * Ce test vérifie les deux, et surtout la limite : on prévient pour ce qui
 * change le travail du comédien, pas pour une faute corrigée dans un synopsis.
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

async function makeAccount(email: string, type: 'talent' | 'production', name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: name, last_name: 'Change' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: type,
      first_name: name,
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', data.user.id)
  if (type === 'talent') {
    await admin
      .from('talent_profiles')
      .upsert(
        { profile_id: data.user.id, playing_age_min: 25, playing_age_max: 40 },
        { onConflict: 'profile_id' },
      )
  }
  return data.user.id
}

test('changing what matters reaches the applicants; closing settles them', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.chg.owner.${stamp}@letitcast.dev`
  const talentEmail = `e2e.chg.talent.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Cora')
  const talentId = await makeAccount(talentEmail, 'talent', 'Théo')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Change Films ${stamp}`,
      slug: `change-films-${stamp}`,
      created_by: ownerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: ownerId, title: `Moving ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Moving ${stamp} — call`,
      description: 'A fisrt draft with a typo.',
      location: 'Lisbon',
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Rider ${stamp}` })
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

  const owner = await signedIn(ownerEmail)
  const countNotifications = async () =>
    (await admin.from('notifications').select('id').eq('recipient_id', talentId)).data?.length ?? 0

  // ── Une correction de texte : l'histoire la garde, personne n'est réveillé ──
  const before = await countNotifications()
  await owner
    .from('casting_calls')
    .update({ description: 'A first draft, typo fixed.' })
    .eq('id', casting!.id)

  const { data: cosmetic } = await admin
    .from('events')
    .select('metadata')
    .eq('entity_id', casting!.id)
    .eq('type', 'CASTING_UPDATED')
  expect(cosmetic ?? [], 'the change is recorded').toHaveLength(1)
  expect(cosmetic![0].metadata?.notified, 'but nobody is woken up').toBe(false)
  expect(await countNotifications(), 'no notification for a typo').toBe(before)

  // ── La date limite bouge : là, on prévient ──
  await owner
    .from('casting_calls')
    .update({ deadline_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
    .eq('id', casting!.id)

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('notifications')
        .select('title')
        .eq('recipient_id', talentId)
        .eq('type', 'casting_updated')
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  // ── Les consignes de tape aussi : c'est le travail demandé ──
  await owner
    .from('roles')
    .update({ selftape_instructions: 'Two takes, the second angrier.' })
    .eq('id', role!.id)

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('notifications')
        .select('title')
        .eq('recipient_id', talentId)
        .eq('type', 'casting_updated')
      return (data ?? []).some((row) => row.title.includes('self-tape'))
    }, { timeout: 20_000 })
    .toBe(true)

  // ── Fermer le casting règle ce qui restait en route ──
  await owner.from('casting_calls').update({ status: 'closed' }).eq('id', casting!.id)

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', application!.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('not_selected')

  const { data: settled } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', application!.id)
    .eq('type', 'PASSED')
  expect(settled ?? [], 'closing decided, and said so').toHaveLength(1)

  const { data: told } = await admin
    .from('notifications')
    .select('id')
    .eq('recipient_id', talentId)
    .eq('type', 'application_status')
  expect((told ?? []).length, 'the talent is not left waiting forever').toBeGreaterThan(0)

  await owner.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
