import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Le recours : signaler, et bloquer.
 *
 * Deux gestes très différents, et le test tient surtout à la différence :
 * signaler ouvre un dossier et **ne supprime rien** ; bloquer coupe ce qui vient
 * et **ne touche pas** à l'historique professionnel des deux personnes.
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

async function makeTalent(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: name, last_name: 'Mod' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: name,
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', data.user.id)
  await admin
    .from('talent_profiles')
    .upsert(
      { profile_id: data.user.id, playing_age_min: 25, playing_age_max: 40 },
      { onConflict: 'profile_id' },
    )
  return data.user.id
}

test('blocking cuts what comes next, and keeps the professional history intact', async () => {
  const stamp = Date.now()
  const victimEmail = `e2e.mod.victim.${stamp}@letitcast.dev`
  const troubleEmail = `e2e.mod.trouble.${stamp}@letitcast.dev`
  const prodEmail = `e2e.mod.prod.${stamp}@letitcast.dev`

  const victimId = await makeTalent(victimEmail, 'Vera')
  const troubleId = await makeTalent(troubleEmail, 'Theo')

  // Une production, pour vérifier que le métier ne bouge pas.
  const { data: prod } = await admin.auth.admin.createUser({
    email: prodEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Pola', last_name: 'Mod' },
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
      name: `Mod Films ${stamp}`,
      slug: `mod-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: prodId, title: `Kept ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: prodId,
      title: `Kept ${stamp} — call`,
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
      talent_id: victimId,
      status: 'shortlisted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const victim = await signedIn(victimEmail)
  const trouble = await signedIn(troubleEmail)

  // Un lien social existe avant le blocage.
  await admin.from('follows').insert({ follower_id: troubleId, following_id: victimId })
  const { data: post } = await admin
    .from('posts')
    .insert({ author_id: troubleId, body: `Noise ${stamp}` })
    .select('id')
    .single()

  // ── Signaler : un dossier, pas une suppression ──
  const { error: reported } = await victim.from('reports').insert({
    reporter_id: victimId,
    subject_type: 'post',
    subject_id: post!.id,
    reason: 'harassment',
    details: 'Repeated messages.',
  })
  expect(reported, 'anyone can report').toBeNull()

  const { data: stillThere } = await admin.from('posts').select('id').eq('id', post!.id)
  expect(stillThere ?? [], 'reporting deletes nothing').toHaveLength(1)

  const { data: file } = await admin
    .from('reports')
    .select('status, reason')
    .eq('subject_id', post!.id)
    .single()
  expect(file?.status, 'it opens a case').toBe('open')

  // Le signalement n'est pas lisible par la personne visée.
  const { data: peeked } = await trouble.from('reports').select('id').eq('subject_id', post!.id)
  expect(peeked ?? [], 'a report is not a public accusation').toHaveLength(0)

  // ── Bloquer ──
  const { error: blocked } = await victim
    .from('blocks')
    .insert({ blocker_id: victimId, blocked_id: troubleId })
  expect(blocked).toBeNull()

  // Le lien social est défait, dans les deux sens.
  const { data: follows } = await admin
    .from('follows')
    .select('follower_id')
    .or(`follower_id.eq.${troubleId},following_id.eq.${troubleId}`)
  expect(follows ?? [], 'following is undone').toHaveLength(0)

  // Et il ne se refait pas.
  const { error: refollow } = await trouble
    .from('follows')
    .insert({ follower_id: troubleId, following_id: victimId })
  expect(refollow, 'a blocked person cannot follow back').not.toBeNull()

  // La publication disparaît du fil des deux côtés.
  const { data: hidden } = await victim.from('posts').select('id').eq('id', post!.id)
  expect(hidden ?? [], 'their posts leave the feed').toHaveLength(0)

  // Écrire n'est plus possible.
  const { data: allowed } = await trouble.rpc('can_message', { p_other: victimId })
  expect(allowed, 'and messaging is closed').toBe(false)

  // ── Mais le métier, lui, n'a pas bougé ──
  const { data: keptApplication } = await admin
    .from('applications')
    .select('status')
    .eq('id', application!.id)
    .single()
  expect(keptApplication?.status, 'the application is untouched').toBe('shortlisted')

  const { data: keptEvents } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', application!.id)
  expect((keptEvents ?? []).length, 'and its history too').toBeGreaterThan(0)

  for (const client of [victim, trouble]) await client.auth.signOut()
  await admin.from('posts').delete().eq('author_id', troubleId)
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [victimId, troubleId, prodId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})
