import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

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

test('an invite-only casting is invisible until someone is invited', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.inv2.owner.${stamp}@letitcast.dev`
  const guestEmail = `e2e.inv2.guest.${stamp}@letitcast.dev`
  const strangerEmail = `e2e.inv2.stranger.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Iris')
  const guestId = await makeAccount(guestEmail, 'talent', 'Gina')
  const strangerId = await makeAccount(strangerEmail, 'talent', 'Sam')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Quiet Films ${stamp}`,
      slug: `quiet-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Embargo ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Embargo ${stamp} — closed call`,
      status: 'published',
      visibility: 'invite_only',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Ghost ${stamp}` })
    .select('id')
    .single()

  const guest = await signedIn(guestEmail)
  const stranger = await signedIn(strangerEmail)
  const owner = await signedIn(ownerEmail)

  // ── Avant l'invitation : invisible des deux côtés du public ──
  for (const [who, client] of [
    ['the future guest', guest],
    ['a stranger', stranger],
  ] as const) {
    const { data } = await client.from('casting_calls').select('id').eq('id', casting!.id)
    expect(data ?? [], `${who} cannot see an invite-only casting`).toHaveLength(0)
    const { data: roles } = await client.from('roles').select('id').eq('id', role!.id)
    expect(roles ?? [], `${who} cannot see its roles`).toHaveLength(0)
  }

  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data: visitor } = await anon.from('casting_calls').select('id').eq('id', casting!.id)
  expect(visitor ?? [], 'and no visitor either').toHaveLength(0)

  // ── L'invitation, envoyée par la production ──
  const { error: inviteError } = await owner.from('casting_invites').insert({
    casting_call_id: casting!.id,
    talent_id: guestId,
    invited_by: ownerId,
    message: 'We thought of you.',
  })
  expect(inviteError, 'the production invites').toBeNull()

  // ── Après : l'invité voit, les autres non ──
  const { data: seen } = await guest.from('casting_calls').select('id, title').eq('id', casting!.id)
  expect(seen ?? [], 'the invited talent now sees it').toHaveLength(1)
  const { data: roles } = await guest.from('roles').select('id').eq('id', role!.id)
  expect(roles ?? [], 'and its roles').toHaveLength(1)

  const { data: stillBlind } = await stranger
    .from('casting_calls')
    .select('id')
    .eq('id', casting!.id)
  expect(stillBlind ?? [], 'a stranger still sees nothing').toHaveLength(0)

  // ── Et l'invité l'apprend ──
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('notifications')
        .select('id')
        .eq('recipient_id', guestId)
        .eq('type', 'casting_invite')
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  // ── Un comédien ne s'invite pas lui-même ──
  const { error: selfInvite } = await stranger.from('casting_invites').insert({
    casting_call_id: casting!.id,
    talent_id: strangerId,
  })
  expect(selfInvite, 'nobody invites themselves').not.toBeNull()

  for (const client of [guest, stranger, owner]) await client.auth.signOut()
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, guestId, strangerId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})

test('a production chooses who can see a casting, and whether a role needs a tape', async ({
  page,
}) => {
  const stamp = Date.now()
  const ownerEmail = `e2e.form.owner.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Nina')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Form Films ${stamp}`,
      slug: `form-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Chosen ${stamp}` })
    .select('id')
    .single()

  await signInAs(page, ownerEmail, 'studio')
  await page.goto('/studio/casting-calls/new')

  // Étape 1 : reprendre le projet existant.
  await page.getByRole('button', { name: new RegExp(`Chosen ${stamp}`) }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Étape 2 : le casting, et qui peut le voir.
  await page.getByLabel('Casting title').fill(`Chosen ${stamp} — call`)
  await page.getByRole('button', { name: /Anyone with the link/ }).click()
  await page.getByRole('button', { name: 'Create and add roles' }).click()

  // Étape 3 : un rôle qui exige une tape.
  await page.getByLabel('Role name').fill(`Silent ${stamp}`)
  await page.getByLabel('A self-tape is required for this role').click()
  await page.getByRole('button', { name: 'Add this role' }).click()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('casting_calls')
        .select('visibility, roles(self_tape_required)')
        .eq('project_id', project!.id)
        .maybeSingle()
      return data ? `${data.visibility}/${data.roles?.[0]?.self_tape_required}` : null
    }, { timeout: 30_000 })
    .toBe('private_link/true')

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(ownerId).catch(() => {})
})

test('a production edits a published casting from the app, and applicants are told', async ({
  page,
}) => {
  const stamp = Date.now()
  const ownerEmail = `e2e.edit.owner.${stamp}@letitcast.dev`
  const talentEmail = `e2e.edit.talent.${stamp}@letitcast.dev`
  const ownerId = await makeAccount(ownerEmail, 'production', 'Elsa')
  const talentId = await makeAccount(talentEmail, 'talent', 'Marc')

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Edit Films ${stamp}`,
      slug: `edit-films-${stamp}`,
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
    .insert({ org_id: org!.id, created_by: ownerId, title: `Second Thoughts ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Second Thoughts ${stamp} — call`,
      location: 'Lyon',
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
  await admin.from('applications').insert({
    role_id: role!.id,
    talent_id: talentId,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  })

  await signInAs(page, ownerEmail, 'studio')
  await page.goto(`/studio/casting/${casting!.id}`)
  await page.getByRole('button', { name: 'Edit casting' }).click()

  // L'avertissement n'apparaît que parce que quelqu'un a candidaté.
  await expect(page.getByText(/1 person has applied/)).toBeVisible({ timeout: 20_000 })

  await page.getByLabel('Location').fill('Marseille')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('casting_calls')
        .select('location')
        .eq('id', casting!.id)
        .single()
      return data?.location
    }, { timeout: 20_000 })
    .toBe('Marseille')

  // Le candidat est prévenu, parce que le lieu fait partie de son travail.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('notifications')
        .select('id')
        .eq('recipient_id', talentId)
        .eq('type', 'casting_updated')
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
