import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * The social graph, and what it actually changes.
 *
 * Following a production is not a decoration: the feed can be filtered on it,
 * the production is told, and the count is read from the rows rather than
 * stored — so it cannot drift.
 */
test('following a production filters the feed and tells them', async ({ page, browser }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Two productions, so the filter has something to exclude.
  const productions = await Promise.all(
    ['Followed', 'Ignored'].map(async (label) => {
      const email = `e2e.social.${label.toLowerCase()}.${stamp}@letitcast.dev`
      const { data } = await admin.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: label, last_name: 'Films' },
      })
      const id = data!.user.id
      await admin
        .from('profiles')
        .update({
          account_type: 'production',
          first_name: label,
          last_name: 'Films',
          onboarding_step: null,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', id)
      const { data: org } = await admin
        .from('organizations')
        .insert({
          name: `${label} Films ${stamp}`,
          slug: `${label.toLowerCase()}-films-${stamp}`,
          created_by: id,
        })
        .select('id')
        .single()
      await admin
        .from('organization_members')
        .insert({ org_id: org!.id, profile_id: id, role: 'owner', status: 'active' })
      const { data: project } = await admin
        .from('projects')
        .insert({ org_id: org!.id, created_by: id, title: `${label} Project ${stamp}` })
        .select('id')
        .single()
      const { data: casting } = await admin
        .from('casting_calls')
        .insert({
          project_id: project!.id,
          created_by: id,
          title: `${label} Project ${stamp} — open call`,
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      await admin
        .from('roles')
        .insert({ casting_call_id: casting!.id, name: `${label} role ${stamp}` })
      return { id, email, orgId: org!.id, projectId: project!.id, title: `${label} Project ${stamp}` }
    }),
  )
  const [followed, ignored] = productions

  const talentEmail = `e2e.social.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Sasha', last_name: 'Link' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Sasha',
      last_name: 'Link',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin.from('talent_profiles').upsert({ profile_id: talentId }, { onConflict: 'profile_id' })

  await signInAs(page, talentEmail, 'talent')

  // ── Nobody followed yet ──
  await expect(page.getByText('Productions followed')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('radio', { name: 'Following' }).click()
  await expect(page.getByText('You do not follow any production yet')).toBeVisible()

  // ── Follow one of the two productions, from its post ──
  await page.getByRole('radio', { name: 'Recent' }).click()
  const post = page.locator('li', { hasText: followed.title }).first()
  await post.getByRole('button', { name: 'Follow' }).click()
  await expect(post.getByRole('button', { name: 'Following' })).toBeVisible({ timeout: 20_000 })
  await expect(post.getByText('1 follower')).toBeVisible()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('organization_follows')
        .select('org_id')
        .eq('profile_id', talentId)
      return data?.map((row) => row.org_id) ?? []
    }, { timeout: 20_000 })
    .toEqual([followed.orgId])

  // ── The feed filter now means something ──
  await page.getByRole('radio', { name: 'Following' }).click()
  await expect(page.getByText(followed.title).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(ignored.title)).toHaveCount(0)

  // ── The production is told ──
  const productionContext = await browser.newContext()
  const productionPage = await productionContext.newPage()
  await signInAs(productionPage, followed.email, 'studio')
  await productionPage.goto('/studio/notifications')
  await expect(productionPage.getByText('New follower').first()).toBeVisible({ timeout: 20_000 })
  await expect(productionPage.getByText(/Sasha Link now follows/)).toBeVisible()

  // ── Unfollowing takes it all back ──
  await page.getByRole('radio', { name: 'Recent' }).click()
  await page.locator('li', { hasText: followed.title }).first()
    .getByRole('button', { name: 'Following' })
    .click()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('organization_follows')
        .select('org_id')
        .eq('profile_id', talentId)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(0)

  // ── Cleanup ──
  for (const production of productions) {
    await admin.from('projects').delete().eq('id', production.projectId)
    await admin.from('organizations').delete().eq('id', production.orgId)
    await admin.auth.admin.deleteUser(production.id)
  }
  await admin.auth.admin.deleteUser(talentId)
})
