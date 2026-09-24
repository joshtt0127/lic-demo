import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le callback, de la proposition à la réponse.
 *
 * Ce qui change vraiment : « callback » n'est plus un mot dans une liste. Il
 * porte une forme, une date dans un fuseau nommé, un lieu ou un lien — et le
 * comédien peut répondre, y compris « pas ce jour-là ».
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
    user_metadata: { first_name: name, last_name: 'Call' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: type,
      first_name: name,
      last_name: 'Call',
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

test('a callback carries what it takes to honour it, and the talent can answer', async ({
  page,
}) => {
  const stamp = Date.now()
  const ownerEmail = `e2e.cb.owner.${stamp}@letitcast.dev`
  const talentEmail = `e2e.cb.talent.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Carla')
  const talentId = await makeAccount(talentEmail, 'talent', 'Bruno')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Back Films ${stamp}`,
      slug: `back-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Second Look ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Second Look ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Lead ${stamp}` })
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
  const talent = await signedIn(talentEmail)

  // ── Une forme sans ce qu'il lui faut est refusée par la base ──
  const { error: empty } = await owner.from('callbacks').insert({
    application_id: application!.id,
    kind: 'in_person',
    title: 'Callback',
  })
  expect(empty, 'an in-person callback without an address means nothing').not.toBeNull()

  // ── La proposition, complète ──
  const when = new Date(Date.now() + 5 * 86_400_000).toISOString()
  const { data: callback, error: created } = await owner
    .from('callbacks')
    .insert({
      application_id: application!.id,
      kind: 'in_person',
      title: `Callback — Lead ${stamp}`,
      scheduled_at: when,
      timezone: 'Europe/Paris',
      location: '12 rue de Rivoli, Paris',
      instructions: 'Scene 4, two takes.',
    })
    .select('id')
    .single()
  expect(created).toBeNull()

  // La candidature suit, le comédien est prévenu, le fait est écrit.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', application!.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('callback')

  const { data: told } = await admin
    .from('notifications')
    .select('title')
    .eq('recipient_id', talentId)
    .eq('type', 'callback')
  expect(told ?? [], 'the talent hears about it').toHaveLength(1)

  const { data: fact } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', callback!.id)
    .eq('type', 'CALLBACK_REQUESTED')
  expect(fact ?? []).toHaveLength(1)

  // ── Le comédien répond, il ne se déplace pas la date ──
  const { error: reschedule } = await talent
    .from('callbacks')
    .update({ scheduled_at: new Date().toISOString() })
    .eq('id', callback!.id)
  expect(reschedule, 'answering is not rescheduling').not.toBeNull()

  const { error: answered } = await talent
    .from('callbacks')
    .update({ response: 'change_requested', response_note: 'Thursday would work better.' })
    .eq('id', callback!.id)
  expect(answered, 'but answering works').toBeNull()

  const { data: back } = await admin
    .from('callbacks')
    .select('response, responded_at')
    .eq('id', callback!.id)
    .single()
  expect(back?.response).toBe('change_requested')
  expect(back?.responded_at, 'the answer is dated by the database').not.toBeNull()

  const { data: productionTold } = await admin
    .from('notifications')
    .select('title')
    .eq('recipient_id', ownerId)
    .eq('type', 'callback')
  expect(
    (productionTold ?? []).some((row) => row.title.includes('asked for another time')),
    'the production hears the answer',
  ).toBe(true)

  // ── Et un tiers ne voit rien de tout ça ──
  const strangerEmail = `e2e.cb.stranger.${stamp}@letitcast.dev`
  const strangerId = await makeAccount(strangerEmail, 'talent', 'Sonia')
  const stranger = await signedIn(strangerEmail)
  const { data: peeked } = await stranger.from('callbacks').select('id').eq('id', callback!.id)
  expect(peeked ?? [], 'a callback is between two parties').toHaveLength(0)

  // ── L'écran du comédien le montre, et le laisse répondre ──
  await signInAs(page, talentEmail, 'talent')
  await page.goto('/talent/auditions')
  await expect(page.getByText('12 rue de Rivoli, Paris')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('You asked for another time')).toBeVisible()

  for (const client of [owner, talent, stranger]) await client.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, talentId, strangerId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})

test('a role that needs a tape holds the application until the tape lands', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.tape.owner.${stamp}@letitcast.dev`
  const talentEmail = `e2e.tape.talent.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Tina')
  const talentId = await makeAccount(talentEmail, 'talent', 'Luca')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Tape Rules ${stamp}`,
      slug: `tape-rules-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Required ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Required ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Taped ${stamp}`, self_tape_required: true })
    .select('id, self_tape_required')
    .single()
  expect(role?.self_tape_required).toBe(true)

  const talent = await signedIn(talentEmail)
  const owner = await signedIn(ownerEmail)

  // ── Candidater sans tape : la candidature attend, en brouillon ──
  const { data: application } = await talent
    .from('applications')
    .insert({ role_id: role!.id, talent_id: talentId, status: 'draft' })
    .select('id, status')
    .single()
  expect(application?.status, 'it waits for the tape').toBe('draft')

  const { data: hidden } = await owner
    .from('applications')
    .select('id')
    .eq('id', application!.id)
  expect(hidden ?? [], 'the production does not see an unfinished application').toHaveLength(0)

  // ── La tape arrive : la candidature part toute seule ──
  const path = `${talentId}/${crypto.randomUUID()}.webm`
  await admin.storage
    .from('selftapes')
    .upload(path, new Blob([new Uint8Array(1024)], { type: 'video/webm' }), {
      contentType: 'video/webm',
    })
  const { data: asset } = await admin
    .from('media_assets')
    .insert({
      owner_id: talentId,
      kind: 'selftape',
      bucket: 'selftapes',
      path,
      mime: 'video/webm',
      bytes: 1024,
    })
    .select('id')
    .single()
  const { data: tape } = await talent
    .from('self_tapes')
    .insert({ application_id: application!.id, media_asset_id: asset!.id })
    .select('id')
    .single()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', application!.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('submitted')

  const { data: submitted } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', tape!.id)
    .eq('type', 'SELF_TAPE_SUBMITTED')
  expect(submitted ?? [], 'the tape is a fact too').toHaveLength(1)

  // ── Remplacer, tant que rien n'est décidé ──
  const secondPath = `${talentId}/${crypto.randomUUID()}.webm`
  await admin.storage
    .from('selftapes')
    .upload(secondPath, new Blob([new Uint8Array(2048)], { type: 'video/webm' }), {
      contentType: 'video/webm',
    })
  const { data: second } = await admin
    .from('media_assets')
    .insert({
      owner_id: talentId,
      kind: 'selftape',
      bucket: 'selftapes',
      path: secondPath,
      mime: 'video/webm',
      bytes: 2048,
    })
    .select('id')
    .single()
  const { error: replaced } = await talent
    .from('self_tapes')
    .update({ media_asset_id: second!.id })
    .eq('id', tape!.id)
  expect(replaced, 'a take can be redone').toBeNull()

  const { data: replacedFact } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', tape!.id)
    .eq('type', 'SELF_TAPE_REPLACED')
  expect(replacedFact ?? [], 'and the swap is recorded').toHaveLength(1)

  // ── Mais plus après la décision ──
  await admin.from('applications').update({ status: 'not_selected' }).eq('id', application!.id)
  const { error: tooLate } = await talent
    .from('self_tapes')
    .update({ media_asset_id: asset!.id })
    .eq('id', tape!.id)
  expect(tooLate, 'the production judged a tape that must stay put').not.toBeNull()

  for (const client of [talent, owner]) await client.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
