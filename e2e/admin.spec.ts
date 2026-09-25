import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * L'administration LIC : ce qu'elle peut, et surtout ce qu'elle ne peut pas.
 *
 * Le principe tenu par ce fichier : **métadonnées par défaut, contenu privé par
 * exception**. Un administrateur voit qu'une self-tape existe — pas la vidéo.
 * Qu'une conversation existe — pas les messages. Le test vérifie les deux
 * moitiés, parce que la seconde est celle qu'on oublie.
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

async function makeAccount(
  email: string,
  type: 'talent' | 'production',
  name: string,
  platformRole: 'none' | 'support' | 'admin' = 'none',
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: name, last_name: 'Adm' },
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
      platform_role: platformRole,
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

test('the console is closed to everyone but LIC staff', async ({ page, browser }) => {
  const stamp = Date.now()
  const outsiderEmail = `e2e.adm.outsider.${stamp}@letitcast.dev`
  const staffEmail = `e2e.adm.staff.${stamp}@letitcast.dev`
  const outsiderId = await makeAccount(outsiderEmail, 'talent', 'Odile')
  const staffId = await makeAccount(staffEmail, 'talent', 'Selma', 'support')

  await signInAs(page, outsiderEmail, 'talent')
  await page.goto('/admin')
  // Renvoyé chez lui, sans écran d'exploitation.
  await page.waitForURL('**/talent', { timeout: 30_000 })

  // Un second navigateur : rester connecté empêcherait d'atteindre l'écran de
  // connexion, qui renvoie les comptes déjà ouverts chez eux.
  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  await signInAs(staffPage, staffEmail, 'talent')
  await staffPage.goto('/admin')
  await expect(staffPage.getByText('Let It Cast · operations')).toBeVisible({ timeout: 20_000 })
  await expect(staffPage.getByRole('radio', { name: 'Reports' })).toBeVisible()
  await staffContext.close()

  for (const id of [outsiderId, staffId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})

test('LIC reads metadata, never private content, and every action leaves a reason', async () => {
  const stamp = Date.now()
  const supportEmail = `e2e.adm.support.${stamp}@letitcast.dev`
  const bossEmail = `e2e.adm.boss.${stamp}@letitcast.dev`
  const prodEmail = `e2e.adm.prod.${stamp}@letitcast.dev`
  const talentEmail = `e2e.adm.talent.${stamp}@letitcast.dev`

  const supportId = await makeAccount(supportEmail, 'talent', 'Sam', 'support')
  const bossId = await makeAccount(bossEmail, 'talent', 'Bea', 'admin')
  const prodId = await makeAccount(prodEmail, 'production', 'Pia')
  const talentId = await makeAccount(talentEmail, 'talent', 'Théa')

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Watched Films ${stamp}`, slug: `watched-films-${stamp}`, created_by: prodId })
    .select('id, verification_status')
    .single()
  expect(org?.verification_status).toBe('unverified')
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: prodId, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: prodId, title: `Under Watch ${stamp}` })
    .select('id')
    .single()
  await admin
    .from('organizations')
    .update({ verification_status: 'verified' })
    .eq('id', org!.id)
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: prodId,
      title: `Under Watch ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Watched ${stamp}` })
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

  // Du contenu privé : une note interne, une tape, une conversation.
  await admin.from('candidate_notes').insert({
    application_id: application!.id,
    author_id: prodId,
    body: 'Internal thoughts.',
    visibility: 'team',
  })
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
  await admin
    .from('self_tapes')
    .insert({ application_id: application!.id, media_asset_id: asset!.id })
  const { data: conversation } = await admin
    .from('conversations')
    .insert({ context_type: 'direct', created_by: prodId })
    .select('id')
    .single()
  await admin.from('conversation_members').insert([
    { conversation_id: conversation!.id, profile_id: prodId },
    { conversation_id: conversation!.id, profile_id: talentId },
  ])
  await admin
    .from('messages')
    .insert({ conversation_id: conversation!.id, sender_id: prodId, body: 'Private words.' })

  const support = await signedIn(supportEmail)
  const boss = await signedIn(bossEmail)

  // ── Ce que le support voit : l'existence, l'état, les dates ──
  const { data: seenApplications } = await support
    .from('applications')
    .select('id, status')
    .eq('id', application!.id)
  expect(seenApplications ?? [], 'support can see an application exists').toHaveLength(1)

  const { data: seenTapes } = await support.from('self_tapes').select('id')
  expect((seenTapes ?? []).length, 'and that tapes exist').toBeGreaterThan(0)

  // ── Ce qu'il ne voit pas ──
  const { data: notes } = await support.from('candidate_notes').select('body')
  expect(notes ?? [], 'internal notes stay with the production').toHaveLength(0)

  const { data: messages } = await support.from('messages').select('body')
  expect(messages ?? [], 'private messages stay private').toHaveLength(0)

  const video = await support.storage.from('selftapes').createSignedUrl(path, 60)
  expect(video.data?.signedUrl, 'and the video stays out of reach').toBeFalsy()

  // ── Le support trie, il ne tranche pas ──
  const { data: post } = await admin
    .from('posts')
    .insert({ author_id: talentId, body: `Reported ${stamp}` })
    .select('id')
    .single()
  await admin.from('reports').insert({
    reporter_id: prodId,
    subject_type: 'post',
    subject_id: post!.id,
    reason: 'spam',
  })
  const { data: file } = await admin
    .from('reports')
    .select('id')
    .eq('subject_id', post!.id)
    .single()

  const { error: triaged } = await support.rpc('admin_set_report_status', {
    p_report: file!.id,
    p_status: 'in_review',
    p_resolution: null,
  })
  expect(triaged, 'support takes a report in hand').toBeNull()

  const { error: closedBySupport } = await support.rpc('admin_set_report_status', {
    p_report: file!.id,
    p_status: 'dismissed',
    p_resolution: 'Nothing to see',
  })
  expect(closedBySupport, 'but does not close it').not.toBeNull()

  const { error: noReason } = await boss.rpc('admin_set_report_status', {
    p_report: file!.id,
    p_status: 'resolved',
    p_resolution: '   ',
  })
  expect(noReason, 'and closing needs a real resolution').not.toBeNull()

  const { error: closed } = await boss.rpc('admin_set_report_status', {
    p_report: file!.id,
    p_status: 'resolved',
    p_resolution: 'Removed after review.',
  })
  expect(closed).toBeNull()

  // ── Suspendre : réservé à l'admin, motif obligatoire, effet réel ──
  const { error: supportSuspends } = await support.rpc('admin_set_user_suspended', {
    p_profile: talentId,
    p_suspended: true,
    p_reason: 'Trying',
  })
  expect(supportSuspends, 'support cannot suspend').not.toBeNull()

  const { error: suspended } = await boss.rpc('admin_set_user_suspended', {
    p_profile: talentId,
    p_suspended: true,
    p_reason: 'Repeated harassment reports.',
  })
  expect(suspended).toBeNull()

  const talent = await signedIn(talentEmail)
  const { error: stillPosting } = await talent
    .from('posts')
    .insert({ author_id: talentId, body: 'Still here?' })
  expect(stillPosting, 'a suspended account cannot publish').not.toBeNull()

  const { error: selfLift } = await talent
    .from('profiles')
    .update({ suspended_at: null })
    .eq('id', talentId)
  expect(selfLift, 'nor lift its own suspension').not.toBeNull()

  const { error: selfPromote } = await talent
    .from('profiles')
    .update({ platform_role: 'admin' })
    .eq('id', talentId)
  expect(selfPromote, 'nor grant itself a platform role').not.toBeNull()

  // ── Et tout a laissé une trace, nominative et motivée ──
  const { data: trail } = await support
    .from('admin_actions')
    .select('action, actor_id, reason')
    .order('created_at', { ascending: false })
    .limit(5)
  const suspension = (trail ?? []).find((row) => row.action === 'user.suspend')
  expect(suspension?.actor_id, 'the trail knows who acted').toBe(bossId)
  expect(suspension?.reason).toContain('harassment')

  const { data: forged } = await boss
    .from('admin_actions')
    .insert({ action: 'user.suspend', subject_type: 'profile', reason: 'forged' })
    .select('id')
  expect(forged ?? [], 'and nobody writes the trail by hand').toHaveLength(0)

  for (const client of [support, boss, talent]) await client.auth.signOut()
  await admin.from('messages').delete().eq('conversation_id', conversation!.id)
  await admin.from('conversation_members').delete().eq('conversation_id', conversation!.id)
  await admin.from('conversations').delete().eq('id', conversation!.id)
  await admin.from('posts').delete().eq('author_id', talentId)
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [supportId, bossId, prodId, talentId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})
