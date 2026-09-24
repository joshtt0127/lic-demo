import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * The selection console: the board is the casting decision, not a view of it.
 *
 * Moving a candidate between columns writes the status on the application —
 * the same row the talent reads on their audition — and the wall answers the
 * question a director actually asks: "where are we on each role?".
 */
test('the console moves a candidate, and the wall shows who is cast', async ({ page, browser }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const productionEmail = `e2e.console.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Cora', last_name: 'Board' },
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
    .insert({ name: `Board Films ${stamp}`, slug: `board-films-${stamp}`, created_by: producerId, verification_status: 'verified' })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: `Low Tide ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `Low Tide ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const roleNames = [`Ana ${stamp}`, `Tom ${stamp}`]
  const { data: roles } = await admin
    .from('roles')
    .insert(roleNames.map((name, index) => ({
      casting_call_id: casting!.id,
      name,
      sort_order: index,
    })))
    .select('id, name')

  // Two candidates on the first role.
  const applicants = await Promise.all(
    [
      { first: 'Lina', last: 'Wave' },
      { first: 'Omar', last: 'Shore' },
    ].map(async ({ first, last }) => {
      const email = `e2e.console.${first.toLowerCase()}.${stamp}@letitcast.dev`
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
      await admin.from('talent_profiles').upsert({ profile_id: id }, { onConflict: 'profile_id' })
      const { data: application } = await admin
        .from('applications')
        .insert({
          role_id: roles![0].id,
          talent_id: id,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      return { id, name: `${first} ${last}`, applicationId: application!.id }
    }),
  )
  const [lina, omar] = applicants

  await signInAs(page, productionEmail, 'studio')

  await page.goto(`/studio/casting/${casting!.id}/console`)
  await expect(page.getByRole('heading', { name: 'Selection console' })).toBeVisible()
  await expect(page.getByText('2 candidates · 2 roles')).toBeVisible({ timeout: 20_000 })

  // Both start in New.
  const newColumn = page.locator('section', { has: page.getByText('New', { exact: true }) }).first()
  await expect(newColumn.getByText(lina.name)).toBeVisible({ timeout: 20_000 })
  await expect(newColumn.getByText(omar.name)).toBeVisible()

  // ── Move one to the shortlist, with the keyboard-friendly control ──
  await page.getByLabel(`Move ${lina.name}`).selectOption('shortlisted')
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', lina.applicationId)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('shortlisted')

  const shortlist = page
    .locator('section', { has: page.getByText('Shortlist', { exact: true }) })
    .first()
  await expect(shortlist.getByText(lina.name)).toBeVisible({ timeout: 20_000 })

  // ── Cast them, and the wall says so ──
  await page.getByLabel(`Move ${lina.name}`).selectOption('cast')
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('applications')
        .select('status')
        .eq('id', lina.applicationId)
        .single()
      return data?.status
    }, { timeout: 20_000 })
    .toBe('cast')

  await page.getByRole('radio', { name: 'Wall' }).click()
  const roleTile = page.locator('li', { hasText: roleNames[0] }).first()
  await expect(roleTile.getByText('Cast for this role')).toBeVisible({ timeout: 20_000 })
  await expect(roleTile.getByText(lina.name)).toBeVisible()

  // A role nobody applied to says so, and sends you to work on it.
  const emptyTile = page.locator('li', { hasText: roleNames[1] }).first()
  await expect(emptyTile.getByText('Nobody has applied yet.')).toBeVisible()
  await emptyTile.getByRole('button', { name: 'Work on this role' }).click()
  await expect(page.getByRole('radio', { name: 'Board' })).toHaveAttribute('aria-checked', 'true')

  // ── The talent sees the decision on their own audition ──
  // Their own browser: the production is signed in on this one.
  const talentContext = await browser.newContext()
  const talentPage = await talentContext.newPage()
  await signInAs(talentPage, `e2e.console.lina.${stamp}@letitcast.dev`, 'talent')
  await talentPage.goto('/talent/auditions')
  await expect(talentPage.getByText('Cast').first()).toBeVisible({ timeout: 20_000 })

  // ── Cleanup ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [lina.id, omar.id, producerId]) await admin.auth.admin.deleteUser(id)
})
