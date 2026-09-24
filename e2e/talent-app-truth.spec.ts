import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Regression guard: a fresh talent account must see *its own* data — and none
 * of the demo fixtures that used to be hard-coded into the talent surfaces
 * (Maya Reyes, "Profile views 312", "Audition matches 14", "Performance score",
 * fake unread badges).
 */

/**
 * The exact strings the old fixture home used to print. Bare numbers are not in
 * this list on purpose: "312" also appears inside the timestamps other specs
 * generate for their casting titles, which made this guard fail on data that
 * was not a leak at all.
 */
const FIXTURE_LEAKS = [
  'Maya Reyes',
  'Vertice Talent',
  'Profile views',
  'Audition matches',
  'Performance score',
]

test('a fresh talent account sees only its own data', async ({ page }) => {
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const email = `e2e.truth.${Date.now()}@letitcast.dev`
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Nora', last_name: 'Bennett' },
  })
  expect(error).toBeNull()
  const userId = created!.user.id

  // Onboarded talent, nothing else: no application, no message, no media.
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      // Comme après un onboarding réel : le MVP est réservé aux majeurs.
      adult_confirmed_at: new Date().toISOString(),
      first_name: 'Nora',
      last_name: 'Bennett',
      city: 'Lisbon',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId)
  await admin
    .from('talent_profiles')
    .upsert({ profile_id: userId, headline: 'Actress · stage & screen' }, { onConflict: 'profile_id' })

  await signInAs(page, email, 'talent')

  // ── Her own identity, in the feed's own rail ──
  await expect(page.getByRole('heading', { name: /Nora/, level: 1 })).toBeAttached()
  await expect(page.getByRole('link', { name: 'Nora Bennett' }).first()).toBeVisible()
  await expect(page.getByText('Actress · stage & screen')).toBeVisible()

  // ── No fixture leakage anywhere on the home ──
  const home = (await page.locator('body').innerText()).toLowerCase()
  for (const leak of FIXTURE_LEAKS) {
    expect(home).not.toContain(leak.toLowerCase())
  }

  // ── Real counters: zero, and honest empty states ──
  await expect(page.getByText('Auditions sent')).toBeVisible()
  await expect(page.getByText('Apply from a post and the audition shows up here')).toBeVisible()
  await expect(page.getByText('Productions can message you once you apply')).toBeVisible()

  // ── The feed's own filters are real: nothing saved, nothing applied ──
  await page.getByRole('radio', { name: 'Saved' }).click()
  await expect(page.getByText('Nothing saved yet')).toBeVisible()
  await page.getByRole('radio', { name: 'Applied' }).click()
  await expect(page.getByText('You have not applied to a casting yet')).toBeVisible()
  await page.getByRole('radio', { name: 'Recent' }).click()

  // ── Badges: nothing unread, so no badge at all ──
  await expect(page.locator('nav').getByText(/^[1-9]\d*$/)).toHaveCount(0)

  // ── The other talent pages are just as empty, and do not crash ──
  await page.goto('/talent/auditions')
  await expect(page.getByRole('heading', { name: 'Auditions' })).toBeVisible()
  await expect(page.getByText('No audition yet')).toBeVisible()

  await page.goto('/talent/messages')
  await expect(page.getByText('No conversation yet')).toBeVisible()

  await page.goto('/talent/notifications')
  await expect(page.getByText('No notification yet')).toBeVisible()

  // ── Casting calls show the real published ones, not fixtures ──
  await page.goto('/talent/casting-calls')
  await expect(page.getByRole('heading', { name: 'Casting calls' })).toBeVisible()
  const castings = await page.locator('body').innerText()
  expect(castings.toLowerCase()).not.toContain('maya reyes')

  await admin.auth.admin.deleteUser(userId)
})
