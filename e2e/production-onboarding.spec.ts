import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Parcours E2E n°2 (brief §43), the part that exists today:
 *
 *   Sign up → I work in Production → profile → create organization → Studio
 *
 * The check that matters: the organization row really exists and the account is
 * its owner, because nothing on the production side works without that.
 */

test('production sign-up creates a real organization and lands in the studio', async ({ page }) => {
  const email = `e2e.prod.${Date.now()}@letitcast.dev`
  const orgName = `Studio E2E ${Date.now()}`

  await page.goto('/auth/sign-up')
  await page.getByLabel('First name').fill('Peter')
  await page.getByLabel('Last name').fill('Known')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // ── Fork ──
  await expect(page.getByRole('heading', { name: /How are you using Let It Cast/i })).toBeVisible()
  await page.getByRole('button', { name: /I work in Production/ }).click()

  // ── Step 1: identity ──
  await expect(page.getByRole('heading', { name: 'Tell us who you are' })).toBeVisible()
  await expect(page.getByText('Step 1 of 2')).toBeVisible()
  await page.getByPlaceholder('Casting director, Producer, Assistant…').fill('Casting director')
  await page.getByRole('button', { name: 'Continue' }).click()

  // ── Step 2: organization ──
  await expect(page.getByRole('heading', { name: 'Set up your organization' })).toBeVisible()
  await expect(page.getByText('Step 2 of 2')).toBeVisible()
  await page.getByLabel('Organization name').fill(orgName)
  await page.getByLabel('Type').selectOption('Studio')
  await page.getByRole('button', { name: /Create and enter Let It Cast/ }).click()

  // ── Studio ──
  await page.waitForURL('**/studio', { timeout: 30_000 })

  // ── The organization is in the database, owned by this account ──
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug, company_type')
    .eq('name', orgName)
    .maybeSingle()

  expect(org).not.toBeNull()
  expect(org?.company_type).toBe('Studio')
  expect(org?.slug).toContain('studio-e2e')

  const { data: members } = await admin
    .from('organization_members')
    .select('role, status')
    .eq('org_id', org!.id)
  expect(members).toHaveLength(1)
  expect(members?.[0].role).toBe('owner')
  expect(members?.[0].status).toBe('active')

  // A refresh keeps the user in the studio: the onboarding is really finished.
  await page.reload()
  await page.waitForURL('**/studio', { timeout: 30_000 })
})
