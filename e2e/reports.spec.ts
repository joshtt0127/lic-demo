import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Reports must be arithmetic, not decoration: every figure is recomputed here
 * from the rows the test itself created, and the CSV export is checked for the
 * actual candidates.
 */
test('the reports count what really happened, and export it', async ({ page }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const productionEmail = `e2e.report.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Rita', last_name: 'Count' },
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
    .insert({ name: `Count Films ${stamp}`, slug: `count-films-${stamp}`, created_by: producerId })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  const projectTitle = `Tally ${stamp}`
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: projectTitle })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `${projectTitle} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  // Two roles: one will be filled, one will stay empty (a risk).
  const { data: roles } = await admin
    .from('roles')
    .insert([
      { casting_call_id: casting!.id, name: `Lead ${stamp}`, sort_order: 0 },
      { casting_call_id: casting!.id, name: `Empty ${stamp}`, sort_order: 1 },
    ])
    .select('id, name')

  // Three candidates on the first role: cast, shortlisted, submitted.
  const plan = [
    { first: 'Ada', last: 'One', status: 'cast' },
    { first: 'Bo', last: 'Two', status: 'shortlisted' },
    { first: 'Cy', last: 'Three', status: 'submitted' },
  ] as const
  const talents = await Promise.all(
    plan.map(async ({ first, last, status }) => {
      const { data } = await admin.auth.admin.createUser({
        email: `e2e.report.${first.toLowerCase()}.${stamp}@letitcast.dev`,
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
      await admin.from('applications').insert({
        role_id: roles![0].id,
        talent_id: id,
        status,
        submitted_at: new Date().toISOString(),
        ...(status === 'cast' || status === 'shortlisted'
          ? { viewed_at: new Date().toISOString(), decided_at: new Date().toISOString() }
          : {}),
      })
      return { id, name: `${first} ${last}` }
    }),
  )
  await admin.from('roles').update({ status: 'booked' }).eq('id', roles![0].id)

  await page.goto('/auth/sign-in')
  await page.getByLabel('Email').fill(productionEmail)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/studio', { timeout: 30_000 })

  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 20_000 })

  // ── The arithmetic ──
  const candidates = page.locator('div', { has: page.getByText('Candidates', { exact: true }) })
  await expect(candidates.getByText('3', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('1/2', { exact: true }).first()).toBeVisible() // roles filled
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible() // shortlisted (incl. cast)

  // Funnel: 3 applied, 2 reached the shortlist, 1 is cast.
  const funnel = page.locator('li', { hasText: 'Shortlisted' }).first()
  await expect(funnel.getByText('67%')).toBeVisible()

  // The empty role is flagged.
  await expect(page.getByText(`Empty ${stamp}`)).toBeVisible()
  await expect(page.getByText('No candidate yet').first()).toBeVisible()

  // The casting line adds up.
  const row = page.locator('tr', { hasText: projectTitle }).first()
  await expect(row.getByText('1/2')).toBeVisible()

  // ── The export is the real list ──
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export 3 candidates/ }).click(),
  ])
  const path = await download.path()
  const csv = path ? await (await import('node:fs/promises')).readFile(path, 'utf8') : ''
  expect(csv).toContain('"Name","Role","Status"')
  for (const talent of talents) expect(csv).toContain(talent.name)
  expect(csv).toContain('Cast')
  expect(csv).toContain(`Lead ${stamp}`)

  // ── Cleanup ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const talent of talents) await admin.auth.admin.deleteUser(talent.id)
  await admin.auth.admin.deleteUser(producerId)
})
