import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * A casting is reviewed by a team, not by one person.
 *
 * Two members vote on the same candidate and each sees the other's vote and
 * reason; the review shows who the team is still waiting on. A viewer — the
 * read-only role — can watch the tape and nothing else, in the UI *and* in the
 * database: the RLS policies are the real gate, the disabled controls only
 * avoid offering what would be refused.
 */
test('a team reviews together, and a viewer stays read-only', async ({ browser }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  async function makeProduction(kind: string, first: string, last: string) {
    const email = `e2e.team.${kind}.${stamp}@letitcast.dev`
    const { data } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: first, last_name: last },
    })
    const id = data!.user.id
    await admin
      .from('profiles')
      .update({
        account_type: 'production',
        first_name: first,
        last_name: last,
        onboarding_step: null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', id)
    return { id, email, name: `${first} ${last}` }
  }

  const owner = await makeProduction('owner', 'Odile', 'Team')
  const member = await makeProduction('member', 'Marc', 'Team')
  const viewer = await makeProduction('viewer', 'Vera', 'Team')

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Team Films ${stamp}`, slug: `team-films-${stamp}`, created_by: owner.id })
    .select('id')
    .single()
  await admin.from('organization_members').insert([
    { org_id: org!.id, profile_id: owner.id, role: 'owner', status: 'active' },
    { org_id: org!.id, profile_id: member.id, role: 'member', status: 'active' },
    { org_id: org!.id, profile_id: viewer.id, role: 'viewer', status: 'active' },
  ])

  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: owner.id, title: `Crew Call ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: owner.id,
      title: `Crew Call ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Sam ${stamp}` })
    .select('id')
    .single()

  // One candidate for the team to argue about.
  const { data: created } = await admin.auth.admin.createUser({
    email: `e2e.team.talent.${stamp}@letitcast.dev`,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Cleo', last_name: 'Stone' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Cleo',
      last_name: 'Stone',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin.from('talent_profiles').upsert({ profile_id: talentId }, { onConflict: 'profile_id' })
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

  async function signIn(email: string) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/auth/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/studio', { timeout: 30_000 })
    return page
  }

  async function openReview(page: Awaited<ReturnType<typeof signIn>>) {
    await page.goto(`/studio/casting/${casting!.id}`)
    await page.getByRole('button', { name: /^Submissions/ }).click()
    await page.getByRole('button', { name: 'Review' }).first().click()
    await expect(page.getByRole('heading', { name: /Cleo Stone/ })).toBeVisible({ timeout: 20_000 })
  }

  // ── The owner votes, with a reason ──
  const ownerPage = await signIn(owner.email)
  await openReview(ownerPage)
  await expect(ownerPage.getByText('0 of 3 teammates reviewed')).toBeVisible()
  await ownerPage.getByLabel('Reason for your vote').fill('Right voice for Sam.')
  await ownerPage.getByRole('button', { name: 'Good match' }).click()
  await expect(ownerPage.getByText('1 of 3 teammates reviewed')).toBeVisible({ timeout: 20_000 })

  // ── The member votes differently, and sees the owner's reason ──
  const memberPage = await signIn(member.email)
  await openReview(memberPage)
  await expect(memberPage.getByText('1 of 3 teammates reviewed')).toBeVisible({ timeout: 20_000 })
  await expect(memberPage.getByText('Right voice for Sam.')).toBeVisible()
  await memberPage.getByRole('button', { name: 'Maybe' }).click()
  await expect(memberPage.getByText('2 of 3 teammates reviewed')).toBeVisible({ timeout: 20_000 })

  // A member may vote and take notes, but not decide.
  await expect(memberPage.getByLabel('Status', { exact: true })).toBeDisabled()
  await memberPage.getByLabel('Team notes — internal').fill('Worth a callback.')
  await memberPage.getByRole('button', { name: 'Add note' }).click()
  await expect(memberPage.getByText('Worth a callback.')).toBeVisible({ timeout: 20_000 })

  // ── The viewer can watch, and that is all ──
  const viewerPage = await signIn(viewer.email)
  await openReview(viewerPage)
  await expect(
    viewerPage.getByText('Your role in this organization is read-only'),
  ).toBeVisible()
  await expect(viewerPage.getByRole('button', { name: 'Good match' })).toHaveCount(0)
  await expect(viewerPage.getByLabel('Status', { exact: true })).toBeDisabled()
  await expect(viewerPage.getByRole('link', { name: /New casting/ })).toHaveCount(0)

  // The database refuses it too — the UI is not the gate.
  const asViewer = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  await asViewer.auth.signInWithPassword({ email: viewer.email, password: DEMO_PASSWORD })
  const { error: voteError } = await asViewer
    .from('candidate_reviews')
    .insert({ application_id: application!.id, reviewer_id: viewer.id, vote: 'good' })
  expect(voteError, 'a viewer must not be able to vote').not.toBeNull()

  const { error: decideError } = await asViewer
    .from('applications')
    .update({ status: 'shortlisted' })
    .eq('id', application!.id)
  const { data: afterTry } = await admin
    .from('applications')
    .select('status')
    .eq('id', application!.id)
    .single()
  expect(decideError ?? afterTry?.status).not.toBe('shortlisted')

  // ── Both votes are on the same row, and the activity records them ──
  const { data: reviews } = await admin
    .from('candidate_reviews')
    .select('reviewer_id, vote, comment')
    .eq('application_id', application!.id)
  expect(reviews).toHaveLength(2)
  expect(reviews!.find((review) => review.reviewer_id === owner.id)).toMatchObject({
    vote: 'good',
    comment: 'Right voice for Sam.',
  })
  expect(reviews!.find((review) => review.reviewer_id === member.id)?.vote).toBe('maybe')

  await ownerPage.reload()
  await ownerPage.getByRole('button', { name: /^Activity/ }).click()
  await expect(ownerPage.getByText(/Marc Team/).first()).toBeVisible({ timeout: 20_000 })

  // ── Cleanup ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [talentId, owner.id, member.id, viewer.id]) {
    await admin.auth.admin.deleteUser(id)
  }
})
