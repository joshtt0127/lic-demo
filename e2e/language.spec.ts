import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD } from './env'

/**
 * EN / FR.
 *
 * The talent app is bilingual: the choice is made before signing in, survives a
 * reload, and follows the account into the app — including the dates, which are
 * formatted in the active locale.
 */
test('a talent can use the app in French, and switch back', async ({ page }) => {
  await page.goto('/auth/sign-in')

  // English by default (the test browser is en-US).
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  await page.getByRole('radio', { name: 'Français' }).click()
  await expect(page.getByRole('heading', { name: 'Content de vous revoir' })).toBeVisible()
  await expect(page.getByLabel('E-mail')).toBeVisible()

  // The preference survives a reload, before any account is involved.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Content de vous revoir' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

  await page.getByLabel('E-mail').fill('maya@letitcast.demo')
  await page.getByLabel('Mot de passe', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/talent', { timeout: 30_000 })

  // The app itself, in French — navigation, counters, feed controls.
  await expect(page.getByRole('link', { name: 'Accueil' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Auditions envoyées')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Récents' })).toBeVisible()

  await page.goto('/talent/auditions')
  await expect(page.getByRole('heading', { name: 'Auditions' })).toBeVisible()
  // Status and self-tape wording come from the dictionary, not the database.
  await expect(page.getByText('Enregistrer ma self-tape').first()).toBeVisible({ timeout: 20_000 })

  // Back to English, from inside the app.
  await page.getByRole('radio', { name: 'English' }).first().click()
  await expect(page.getByText('Record my self-tape').first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
