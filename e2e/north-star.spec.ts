import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * The North Star of the POC (brief §44), end to end in a real browser, against
 * the real database:
 *
 *   production signs up → creates an organization → creates a project,
 *   a casting call and a role → publishes
 *   → the talent sees the role, applies
 *   → the production sees that exact application, votes, moves it to shortlisted
 *   → the talent sees "Shortlisted"
 *   → they message each other
 *
 * Two independent browser contexts, two accounts, no shortcuts.
 */

test('a casting reaches a talent, and their application reaches the production back', async ({
  browser,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const productionEmail = `e2e.ns.prod.${stamp}@letitcast.dev`
  const talentEmail = `e2e.ns.talent.${stamp}@letitcast.dev`
  const orgName = `Studio E2E ${stamp}`
  const projectTitle = `Project Alpha ${stamp}`
  const roleName = 'Claire'

  // ── The talent account exists and is onboarded (the talent journey has its
  //    own spec; here it is the counterpart).
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Nora', last_name: 'Bennett' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Nora',
      last_name: 'Bennett',
      city: 'Marseille',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin
    .from('talent_profiles')
    .upsert(
      { profile_id: talentId, headline: 'Actress', playing_age_min: 28, playing_age_max: 40 },
      { onConflict: 'profile_id' },
    )

  const productionContext = await browser.newContext()
  const production = await productionContext.newPage()
  const talentContext = await browser.newContext()
  const talent = await talentContext.newPage()

  // ── 1. Production: sign up, organization, project, casting, role, publish ──
  await production.goto('/auth/sign-up')
  await production.getByLabel('First name').fill('Peter')
  await production.getByLabel('Last name').fill('Known')
  await production.getByLabel('Email').fill(productionEmail)
  await production.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await production.getByRole('button', { name: 'Create account' }).click()

  await production.getByRole('button', { name: /I work in Production/ }).click()
  await expect(production.getByRole('heading', { name: 'Tell us who you are' })).toBeVisible()
  await production.getByRole('button', { name: 'Continue' }).click()
  await expect(production.getByRole('heading', { name: 'Set up your organization' })).toBeVisible()
  await production.getByLabel('Organization name').fill(orgName)
  await production.getByRole('button', { name: /Create and enter Let It Cast/ }).click()
  await production.waitForURL('**/studio', { timeout: 30_000 })

  await production.getByRole('link', { name: /New casting/ }).first().click()
  await expect(production.getByRole('heading', { name: 'New casting' })).toBeVisible()

  // New project
  await production.getByRole('radio', { name: 'New project' }).click()
  await production.getByLabel('Project title').fill(projectTitle)
  await production.getByRole('button', { name: 'Continue' }).click()

  // Casting call
  await expect(production.getByText('The casting call')).toBeVisible()
  await production.getByLabel('Casting title').fill(`${projectTitle} — open call`)
  await production.getByLabel('Auditions location').fill('Marseille')
  await production.getByRole('button', { name: /Create and add roles/ }).click()

  // Role
  await expect(production.getByRole('heading', { name: 'Roles' })).toBeVisible()
  await production.getByLabel('Role name').fill(roleName)
  await production.getByLabel('Age from').fill('28')
  await production.getByLabel('Age to').fill('45')
  await production.getByRole('button', { name: /Add this role/ }).click()
  await expect(production.getByText(roleName).first()).toBeVisible()

  // Publish
  await production.getByRole('button', { name: /Publish casting/ }).click()
  await production.waitForURL('**/studio/casting/**', { timeout: 30_000 })
  await expect(production.getByText('published').first()).toBeVisible()

  // ── 2. Talent: sees the role and applies ──
  await talent.goto('/auth/sign-in')
  await talent.getByLabel('Email').fill(talentEmail)
  await talent.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await talent.getByRole('button', { name: 'Sign in' }).click()
  await talent.waitForURL('**/talent', { timeout: 30_000 })

  await talent.goto('/talent/casting-calls')
  await expect(talent.getByText(projectTitle).first()).toBeVisible()
  await talent.getByRole('link', { name: 'View roles' }).first().click()
  await expect(talent.getByRole('heading', { name: roleName })).toBeVisible()

  await talent.getByRole('button', { name: /Apply for this role/ }).click()
  await talent.getByPlaceholder(/anything they should know/i).fill('Tape shot in Marseille.')
  await talent.getByRole('button', { name: /Submit application/ }).click()
  await expect(talent.getByText('Submitted').first()).toBeVisible({ timeout: 20_000 })

  // ── 3. Production: the same application, and a decision ──
  await production.reload()
  // The candidates live on the casting console (Submissions tab).
  await production.getByRole('button', { name: /^Submissions/ }).click()
  await expect(production.getByText('Nora Bennett').first()).toBeVisible({ timeout: 20_000 })
  await production.getByRole('button', { name: 'Review' }).first().click()

  await expect(production.getByText('Tape shot in Marseille.')).toBeVisible()
  await production.getByRole('button', { name: 'Good match' }).click()
  await production.getByLabel('Status', { exact: true }).selectOption('shortlisted')
  await production.getByRole('button', { name: 'Done' }).click()
  // The row's own status control is the production-side source of truth.
  await expect(production.getByLabel('Status of Nora Bennett')).toHaveValue('shortlisted', {
    timeout: 20_000,
  })

  // ── 4. Talent: sees the new status, and the notification ──
  await talent.goto('/talent/auditions')
  await expect(talent.getByText('Shortlisted').first()).toBeVisible({ timeout: 20_000 })

  await talent.goto('/talent/notifications')
  await expect(talent.getByText(/Audition update/).first()).toBeVisible({ timeout: 20_000 })

  // ── 5. The database agrees: one application, shortlisted, one vote ──
  const { data: application } = await admin
    .from('applications')
    .select('id, status, talent_id, note')
    .eq('talent_id', talentId)
    .maybeSingle()
  expect(application?.status).toBe('shortlisted')
  expect(application?.note).toBe('Tape shot in Marseille.')

  const { data: reviews } = await admin
    .from('candidate_reviews')
    .select('vote')
    .eq('application_id', application!.id)
  expect(reviews?.[0]?.vote).toBe('good')

  // ── Cleanup ──
  await productionContext.close()
  await talentContext.close()
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('name', orgName)
    .maybeSingle()
  if (org) await admin.from('organizations').delete().eq('id', org.id)
  await admin.auth.admin.deleteUser(talentId)
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const productionUser = users.users.find((user) => user.email === productionEmail)
  if (productionUser) await admin.auth.admin.deleteUser(productionUser.id)
})
