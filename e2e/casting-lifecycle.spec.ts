import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * The whole lifecycle of a casting, on the real database:
 *
 *   draft → published → a talent applies → shortlisted → callback → cast,
 *   role booked, submissions closed
 *
 * and, at every step, what the talent is allowed to see. The last part is the
 * one that used to be wrong: closing submissions removed the talent's read
 * access to the role, the casting and the project, so their own audition lost
 * its name (fixed in 20260918090000).
 */
test('a casting goes from draft to cast, and the talent sees the truth at each step', async ({
  browser,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const projectTitle = `Harbour Lights ${stamp}`
  const roleName = `Elin ${stamp}`

  // ── Production account with an organization ──
  const productionEmail = `e2e.life.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Lena', last_name: 'Cycle' },
  })
  const producerId = producer!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', producerId)
  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Cycle Films ${stamp}`, slug: `cycle-films-${stamp}`, created_by: producerId })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  // ── Two talents: one applies, one only watches the feed ──
  const applicants = await Promise.all(
    [
      { kind: 'applicant', first: 'Nour', last: 'Bright' },
      { kind: 'bystander', first: 'Iris', last: 'Watch' },
    ].map(async ({ kind, first, last }) => {
      const email = `e2e.life.${kind}.${stamp}@letitcast.dev`
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
          account_type: 'talent',
          first_name: first,
          last_name: last,
          onboarding_step: null,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', id)
      await admin
        .from('talent_profiles')
        .upsert({ profile_id: id, headline: 'Actress' }, { onConflict: 'profile_id' })
      return { id, email, name: `${first} ${last}` }
    }),
  )
  const [applicant, bystander] = applicants

  const productionContext = await browser.newContext()
  const production = await productionContext.newPage()
  await signInAs(production, productionEmail, 'studio')

  // ── 1. Create a casting and a role through the UI: it starts as a draft ──
  await production.goto('/studio/casting-calls/new')
  await production.getByRole('radio', { name: 'New project' }).click()
  await production.getByLabel('Project title').fill(projectTitle)
  await production.getByRole('button', { name: 'Continue' }).click()

  await production.getByLabel('Casting title').fill(`${projectTitle} — open call`)
  await production.getByLabel('Auditions location').fill('Brest')
  await production.getByRole('button', { name: /Create and add roles/ }).click()

  await production.getByLabel('Role name').fill(roleName)
  await production.getByRole('button', { name: /Add this role/ }).click()
  await expect(production.getByText(roleName).first()).toBeVisible()

  const castingId = (await admin
    .from('casting_calls')
    .select('id, status')
    .eq('created_by', producerId)
    .single()).data!
  expect(castingId.status).toBe('draft')

  // A draft is invisible to talents.
  const talentContext = await browser.newContext()
  const talent = await talentContext.newPage()
  await signInAs(talent, applicant.email, 'talent')
  await talent.goto('/talent/casting-calls')
  await expect(talent.getByText(projectTitle)).toHaveCount(0)

  // ── 2. Publish: the role shows up and can be applied to ──
  await production.getByRole('button', { name: /Publish casting/ }).click()
  await production.waitForURL('**/studio/casting/**', { timeout: 30_000 })
  await expect(production.getByText('published').first()).toBeVisible()

  await talent.goto('/talent')
  await expect(talent.getByText(projectTitle).first()).toBeVisible({ timeout: 20_000 })
  const post = talent.locator('li', { hasText: projectTitle }).first()
  await post.getByRole('button', { name: 'Apply' }).click()
  await talent.getByPlaceholder(/anything they should know/i).fill('Local to Brest.')
  await talent.getByRole('button', { name: /Submit application/ }).click()
  await expect(post.getByText('Submitted').first()).toBeVisible({ timeout: 20_000 })

  // ── 3. Shortlist → callback → cast, from the production console ──
  await production.reload()
  await production.getByRole('button', { name: /^Submissions/ }).click()
  const status = production.getByLabel(`Status of ${applicant.name}`, { exact: true })
  for (const decision of ['shortlisted', 'callback', 'cast']) {
    await status.selectOption(decision)
    await expect(status).toHaveValue(decision, { timeout: 20_000 })
  }

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('talent_id', applicant.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('cast')

  // The talent sees each decision, and the notification the trigger wrote.
  await talent.goto('/talent/auditions')
  await expect(talent.getByText('Cast').first()).toBeVisible({ timeout: 20_000 })
  await talent.goto('/talent/notifications')
  await expect(talent.getByText(/Audition update/).first()).toBeVisible({ timeout: 20_000 })

  // ── 4. The production books the role and closes submissions ──
  await production.getByRole('button', { name: /^Roles/ }).click()
  // Le tableau des rôles a une version carte sur téléphone : on vise le
  // contrôle réellement affiché, pas les deux.
  await production
    .getByLabel(`Status of ${roleName}`, { exact: true })
    .locator('visible=true')
    .selectOption('booked')
  await expect
    .poll(async () => {
      const { data } = await admin.from('roles').select('status').eq('name', roleName).single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('booked')

  // A role that is cast must not offer an Apply button to anyone else.
  const bystanderContext = await browser.newContext()
  const watcher = await bystanderContext.newPage()
  await signInAs(watcher, bystander.email, 'talent')
  await watcher.goto('/talent')
  const watchedPost = watcher.locator('li', { hasText: projectTitle }).first()
  await expect(watchedPost.getByText('This role is cast')).toBeVisible({ timeout: 20_000 })
  await expect(watchedPost.getByRole('button', { name: 'Apply' })).toHaveCount(0)

  await production.getByRole('button', { name: /Close submissions/ }).click()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('casting_calls')
        .select('status')
        .eq('id', castingId.id)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('closed')

  // ── 5. Closed: gone from the feed, still fully readable by the applicant ──
  await watcher.goto('/talent')
  await expect(watcher.getByText(projectTitle)).toHaveCount(0)

  await talent.goto('/talent/auditions')
  await expect(talent.getByText(roleName).first()).toBeVisible({ timeout: 20_000 })
  await expect(talent.getByText(projectTitle).first()).toBeVisible()
  await expect(talent.getByText('Closed casting').first()).toBeVisible()

  // ── Cleanup ──
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('title', projectTitle)
    .single()
  if (project) await admin.from('projects').delete().eq('id', project.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [applicant.id, bystander.id, producerId]) {
    await admin.auth.admin.deleteUser(id)
  }
})
