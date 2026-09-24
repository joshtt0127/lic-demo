import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD } from './env'

/**
 * Parcours E2E n°1 (brief §42), the part that exists today:
 *
 *   Landing → Sign up → I'm a Talent → onboarding → profile
 *
 * The assertion that matters is the last one: what the user typed is still
 * there after a full reload, because it lives in Postgres and not in React.
 */

test.describe('Talent sign-up and onboarding', () => {
  test('creates an account, completes the onboarding and persists the profile', async ({ page }) => {
    const email = `e2e.talent.${Date.now()}@letitcast.dev`

    // ── Landing ──
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /performance layer of global casting/i })).toBeVisible()
    await page.getByRole('button', { name: 'Create your account' }).click()

    // ── Sign up ──
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('First name').fill('Nora')
    await page.getByLabel('Last name').fill('Bennett')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    // ── Account type ──
    await expect(page.getByRole('heading', { name: /How are you using Let It Cast/i })).toBeVisible()
    await page.getByRole('button', { name: /I.?m a Talent/ }).click()

    // ── Identity ──
    await expect(page.getByRole('heading', { name: 'Tell us who you are' })).toBeVisible()
    await expect(page.getByText('Step 1 of 4')).toBeVisible()
    await expect(page.getByLabel('First name')).toHaveValue('Nora')
    await page.getByPlaceholder('Actress · 2x lead · SAG-AFTRA').fill('Actress · stage & screen')
    await page.getByPlaceholder('Los Angeles').fill('Lisbon')
    // Le MVP est réservé aux majeurs : la déclaration est explicite, et la base
    // refuse une candidature sans elle.
    await page.getByLabel('I am 18 or over').click()
    await page.getByRole('button', { name: 'Continue' }).click()

    // ── Casting profile ──
    await expect(page.getByRole('heading', { name: 'Your casting profile' })).toBeVisible()
    await page.getByRole('radio', { name: 'Female' }).click()
    await page.getByPlaceholder('24').fill('26')
    await page.getByPlaceholder('34').fill('36')
    await page.getByRole('button', { name: 'Continue' }).click()

    // ── Skills ──
    await expect(page.getByRole('heading', { name: 'What can you do?' })).toBeVisible()
    await page.getByPlaceholder(/Search a skill/).fill('Stage combat')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Stage combat')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    // ── Media / final step (skippable) ──
    await expect(page.getByRole('heading', { name: /You.?re all set/ })).toBeVisible()
    await expect(page.getByText(/Step 4 \/ 4/i)).toBeVisible()
    await page.getByRole('button', { name: /Enter Let It Cast/ }).click()

    // ── Landed in the talent space ──
    await page.waitForURL('**/talent')
    await page.goto('/talent/profile')

    await expect(page.getByRole('heading', { name: 'Nora Bennett' })).toBeVisible()
    await expect(page.getByText('Actress · stage & screen')).toBeVisible()
    await expect(page.getByText('26–34').or(page.getByText('26–36'))).toBeVisible()
    await expect(page.getByText('Stage combat')).toBeVisible()

    // ── The real test: a full reload keeps everything ──
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Nora Bennett' })).toBeVisible()
    await expect(page.getByText('Actress · stage & screen')).toBeVisible()
    await expect(page.getByText('Stage combat')).toBeVisible()
  })

  test('an unfinished onboarding resumes where it stopped', async ({ page }) => {
    const email = `e2e.resume.${Date.now()}@letitcast.dev`

    await page.goto('/auth/sign-up')
    await page.getByLabel('First name').fill('Ada')
    await page.getByLabel('Last name').fill('Rowe')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.getByRole('button', { name: /I.?m a Talent/ }).click()
    await expect(page.getByRole('heading', { name: 'Tell us who you are' })).toBeVisible()
    await page.getByLabel('I am 18 or over').click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Your casting profile' })).toBeVisible()

    // Leave mid-wizard, come back: same step, not the beginning.
    await page.goto('/')
    await page.goto('/talent/profile')
    await expect(page.getByRole('heading', { name: 'Your casting profile' })).toBeVisible()
  })
})
