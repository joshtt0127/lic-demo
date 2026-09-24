import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * La machine à états d'une candidature.
 *
 * Avant, la base vérifiait qui pouvait changer un statut, jamais vers quoi :
 * une candidature pouvait passer de « envoyée » à « retenue » sans avoir été
 * regardée, ou revenir de « retenue » à « brouillon ». Ce test enferme les deux
 * moitiés de la règle — les transitions permises, et la trace qu'elles laissent.
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
    user_metadata: { first_name: name, last_name: 'State' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: type,
      first_name: name,
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', data.user.id)
  if (type === 'talent') {
    await admin
      .from('talent_profiles')
      .upsert({ profile_id: data.user.id }, { onConflict: 'profile_id' })
  }
  return data.user.id
}

test('an application only moves the way the workflow allows, and never in silence', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.sm.owner.${stamp}@letitcast.dev`
  const memberEmail = `e2e.sm.member.${stamp}@letitcast.dev`
  const talentEmail = `e2e.sm.talent.${stamp}@letitcast.dev`

  const ownerId = await makeAccount(ownerEmail, 'production', 'Otis')
  const memberId = await makeAccount(memberEmail, 'production', 'Mina')
  const talentId = await makeAccount(talentEmail, 'talent', 'Tessa')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `State Films ${stamp}`,
      slug: `state-films-${stamp}`,
      created_by: ownerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin.from('organization_members').insert([
    { org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' },
    { org_id: org!.id, profile_id: memberId, role: 'member', status: 'active' },
  ])
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: ownerId, title: `Ladder ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Ladder ${stamp} — call`,
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
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const owner = await signedIn(ownerEmail)
  const member = await signedIn(memberEmail)
  const talent = await signedIn(talentEmail)

  const move = async (client: SupabaseClient, status: string) =>
    (await client.from('applications').update({ status }).eq('id', application!.id).select('status'))
      .data ?? []

  // ── Les raccourcis sont fermés ──
  expect(await move(owner, 'cast'), 'submitted → cast skips the whole review').toHaveLength(0)
  expect(await move(owner, 'draft'), 'a submitted application never goes back to draft').toHaveLength(0)
  expect(await move(talent, 'shortlisted'), 'a talent does not shortlist themselves').toHaveLength(0)
  expect(await move(member, 'not_selected'), 'a member may not decide').toHaveLength(0)

  // ── Le chemin normal ──
  expect(await move(member, 'viewed'), 'a member opens the submission').toHaveLength(1)
  expect(await move(owner, 'under_review')).toHaveLength(1)
  expect(await move(owner, 'shortlisted')).toHaveLength(1)
  expect(await move(owner, 'callback')).toHaveLength(1)
  expect(await move(owner, 'cast')).toHaveLength(1)

  // ── Et depuis « retenu », on ne retombe pas n'importe où ──
  expect(await move(owner, 'submitted'), 'cast never rewinds to submitted').toHaveLength(0)
  expect(await move(owner, 'shortlisted'), 'but a casting can be undone, knowingly').toHaveLength(1)

  // ── La trace ──
  const { data: events } = await admin
    .from('events')
    .select('type, before, after, actor_id, subject_id, metadata')
    .eq('entity_type', 'application')
    .eq('entity_id', application!.id)
    .order('occurred_at', { ascending: true })

  const types = (events ?? []).map((row) => row.type)
  expect(types, 'every step left a fact behind').toEqual([
    'APPLICATION_SUBMITTED',
    'SUBMISSION_OPENED',
    'SUBMISSION_REVIEWED',
    'SHORTLISTED',
    'CALLBACK_REQUESTED',
    'CAST',
    'SHORTLISTED',
  ])

  const opened = events!.find((row) => row.type === 'SUBMISSION_OPENED')
  expect(opened?.actor_id, 'the fact knows who did it').toBe(memberId)
  expect(opened?.subject_id, 'and who it is about').toBe(talentId)
  expect(opened?.before).toEqual({ status: 'submitted' })
  expect(opened?.after).toEqual({ status: 'viewed' })

  const undone = events!.at(-1)
  expect(undone?.metadata?.reversal, 'undoing a casting is marked as such').toBe(true)

  // ── Qui peut lire cette histoire ──
  const { data: talentSees } = await talent
    .from('events')
    .select('type')
    .eq('entity_id', application!.id)
  expect((talentSees ?? []).length, 'the talent reads their own history').toBeGreaterThan(0)

  const strangerEmail = `e2e.sm.stranger.${stamp}@letitcast.dev`
  const strangerId = await makeAccount(strangerEmail, 'talent', 'Sara')
  const stranger = await signedIn(strangerEmail)
  const { data: strangerSees } = await stranger
    .from('events')
    .select('type')
    .eq('entity_id', application!.id)
  expect(strangerSees ?? [], 'nobody else does').toHaveLength(0)

  // ── Et les faits ne se réécrivent pas ──
  const { error: forged } = await owner
    .from('events')
    .insert({ type: 'CAST', entity_type: 'application', entity_id: application!.id })
  expect(forged, 'history is written by the system, not by clients').not.toBeNull()

  for (const client of [owner, member, talent, stranger]) await client.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, memberId, talentId, strangerId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})

test('a talent can withdraw while the production has not decided, and the production hears it', async ({
  page,
}) => {
  const stamp = Date.now()
  const ownerEmail = `e2e.wd.owner.${stamp}@letitcast.dev`
  const talentEmail = `e2e.wd.talent.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Wanda')
  const talentId = await makeAccount(talentEmail, 'talent', 'Wren')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Exit Films ${stamp}`,
      slug: `exit-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Leaving ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Leaving ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Exit ${stamp}` })
    .select('id')
    .single()
  // Déjà présélectionné : c'est le cas qui compte, pas le lendemain de l'envoi.
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

  page.on('dialog', (dialog) => dialog.accept())
  await signInAs(page, talentEmail, 'talent')
  await page.goto('/talent/auditions')
  await page.getByRole('button', { name: 'Withdraw' }).first().click()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', application!.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('withdrawn')

  // La candidature n'est pas effacée : son histoire reste lisible.
  const { data: still } = await admin
    .from('applications')
    .select('id')
    .eq('id', application!.id)
  expect(still ?? [], 'a withdrawal is a state, not a deletion').toHaveLength(1)

  const { data: events } = await admin
    .from('events')
    .select('type')
    .eq('entity_id', application!.id)
    .eq('type', 'APPLICATION_WITHDRAWN')
  expect(events ?? [], 'the withdrawal is a fact').toHaveLength(1)

  const { data: notified } = await admin
    .from('notifications')
    .select('title')
    .eq('recipient_id', ownerId)
    .eq('entity_id', application!.id)
  expect(
    (notified ?? []).some((row) => row.title.includes('withdrew')),
    'the production is told',
  ).toBe(true)

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})

test('one application per role, several roles per casting, and a profile that can be judged', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.el.owner.${stamp}@letitcast.dev`
  const readyEmail = `e2e.el.ready.${stamp}@letitcast.dev`
  const bareEmail = `e2e.el.bare.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Elsa')
  const readyId = await makeAccount(readyEmail, 'talent', 'Rita')
  const bareId = await makeAccount(bareEmail, 'talent', 'Bo')

  // Rita a ce qu'il faut pour être jugée ; Bo vient de créer son compte.
  await admin
    .from('profiles')
    .update({ first_name: 'Rita', last_name: 'Ready', city: 'Paris', avatar_url: 'https://x/a.jpg' })
    .eq('id', readyId)
  await admin
    .from('talent_profiles')
    .update({ playing_age_min: 25, playing_age_max: 35 })
    .eq('profile_id', readyId)
  await admin.from('profiles').update({ last_name: null, city: null }).eq('id', bareId)

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Gate Films ${stamp}`,
      slug: `gate-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Twin ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Twin ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: roles } = await admin
    .from('roles')
    .insert([
      { casting_call_id: casting!.id, name: `Sister ${stamp}` },
      { casting_call_id: casting!.id, name: `Brother ${stamp}` },
    ])
    .select('id')

  const ready = await signedIn(readyEmail)
  const bare = await signedIn(bareEmail)

  // ── Deux rôles du même casting : normal ──
  const first = await ready
    .from('applications')
    .insert({ role_id: roles![0].id, talent_id: readyId, status: 'submitted' })
    .select('id')
  expect(first.error, 'applying to a role').toBeNull()
  const second = await ready
    .from('applications')
    .insert({ role_id: roles![1].id, talent_id: readyId, status: 'submitted' })
    .select('id')
  expect(second.error, 'and to another role of the same casting').toBeNull()

  // ── Deux fois le même rôle : non ──
  const duplicate = await ready
    .from('applications')
    .insert({ role_id: roles![0].id, talent_id: readyId, status: 'submitted' })
  expect(duplicate.error, 'but never twice for the same role').not.toBeNull()

  // ── Et se retirer ne rouvre pas la porte : l'unicité est totale ──
  // (⚠️ décision produit ouverte — voir la migration 20260924112100.)
  await ready.from('applications').update({ status: 'withdrawn' }).eq('id', first.data![0].id)
  const again = await ready
    .from('applications')
    .insert({ role_id: roles![0].id, talent_id: readyId, status: 'submitted' })
  expect(again.error, 'withdrawing does not free the slot today').not.toBeNull()

  // ── Un profil qui ne permet pas de juger ──
  const { data: gaps } = await bare.rpc('missing_for_application', { p_talent: bareId })
  expect(gaps, 'the app can say exactly what is missing').toEqual(
    expect.arrayContaining(['name', 'photo', 'playingAge', 'location']),
  )
  const refused = await bare
    .from('applications')
    .insert({ role_id: roles![0].id, talent_id: bareId, status: 'submitted' })
  expect(refused.error, 'and the database refuses the application').not.toBeNull()

  await ready.auth.signOut()
  await bare.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, readyId, bareId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
