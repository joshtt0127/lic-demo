import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * The talent home is a feed: every published casting call is a post authored by
 * the production that opened it, and applying happens from the post itself.
 *
 * This proves the whole chain on the real database — a casting published by an
 * organization appears in another account's feed with that organization as the
 * author, and "Apply" from the post writes the `applications` row that the
 * production will review.
 */
test('a published casting appears in the feed as a post, and applying works from it', async ({
  page,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const orgName = `Feed Pictures ${stamp}`
  const projectTitle = `The Long Wait ${stamp}`
  const roleName = `Camille ${stamp}`

  // ── A production and its published casting call ──
  const { data: producer } = await admin.auth.admin.createUser({
    email: `e2e.feed.prod.${stamp}@letitcast.dev`,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Paul', last_name: 'Feed' },
  })
  const producerId = producer!.user.id

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: orgName,
      slug: `feed-pictures-${stamp}`,
      company_type: 'Production company',
      city: 'Marseille',
      country: 'FR',
      created_by: producerId,
    })
    .select('id')
    .single()

  const { data: project } = await admin
    .from('projects')
    .insert({
      org_id: org!.id,
      created_by: producerId,
      title: projectTitle,
      production_type: 'Feature film',
      synopsis: 'A harbour town, a missing brother, and a summer that refuses to end.',
    })
    .select('id')
    .single()

  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `${projectTitle} — open call`,
      description: 'Open call for the two leads. Self-tapes welcome.',
      location: 'Marseille',
      compensation: 'Union scale',
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  await admin.from('roles').insert({
    casting_call_id: casting!.id,
    name: roleName,
    role_type: 'lead',
    playing_age_min: 25,
    playing_age_max: 40,
  })

  // ── The talent who will see it in their feed ──
  const talentEmail = `e2e.feed.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Ines', last_name: 'Feed' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Ines',
      last_name: 'Feed',
      city: 'Marseille',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin
    .from('talent_profiles')
    .upsert({ profile_id: talentId, headline: 'Actress' }, { onConflict: 'profile_id' })

  await page.goto('/auth/sign-in')
  await page.getByLabel('Email').fill(talentEmail)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/talent', { timeout: 30_000 })

  // ── The post: the organization is the author, the role is the action ──
  const post = page.locator('li', { hasText: projectTitle }).first()
  await expect(post.getByRole('link', { name: orgName })).toBeVisible()
  await expect(post.getByText('Production company · Feature film · Marseille, FR')).toBeVisible()
  await expect(post.getByText('Open call for the two leads')).toBeVisible()
  await expect(post.getByRole('link', { name: roleName })).toBeVisible()

  // ── Save really writes `saved_castings` ──
  await post.getByRole('button', { name: 'Save this casting call' }).click()
  await expect(post.getByRole('button', { name: 'Remove from saved' })).toBeVisible()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('saved_castings')
        .select('casting_call_id')
        .eq('talent_id', talentId)
      return data?.length ?? 0
    })
    .toBe(1)

  // ── Apply straight from the post ──
  await post.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByRole('heading', { name: `Apply — ${roleName}` })).toBeVisible()
  await page.getByPlaceholder(/anything they should know/i).fill('Available all summer.')
  await page.getByRole('button', { name: /Submit application/ }).click()

  // Applying leads straight to the tape — that is the point of applying.
  await expect(page.getByRole('heading', { name: `Self-tape — ${roleName}` })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('Your application is sent')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record my self-tape' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  // The post now carries the status, and the feed shows the activity.
  await expect(post.getByText('Submitted').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('You applied').first()).toBeVisible()

  const { data: applications } = await admin
    .from('applications')
    .select('status, note')
    .eq('talent_id', talentId)
  expect(applications).toHaveLength(1)
  expect(applications![0].status).toBe('submitted')
  expect(applications![0].note).toBe('Available all summer.')

  // ── It survives a reload: the feed is read from the database ──
  await page.reload()
  await expect(page.locator('li', { hasText: projectTitle }).first().getByText('Submitted').first())
    .toBeVisible({ timeout: 20_000 })

  // ── Cleanup (the casting cascades from the project) ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
