import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

/** Reads `.env.local` — the E2E run talks to the same project as the app. */
export function localEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.env.local')
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  )
}

export const DEMO_PASSWORD = localEnv().DEMO_PASSWORD || 'LetItCast2026!'

/**
 * Signs in through the UI and waits for the surface.
 *
 * Retried once: a full suite creates a dozen accounts and signs in as many
 * times within a few minutes, and the auth endpoint occasionally answers with a
 * rate limit. The app shows that error correctly — the test just should not
 * fail on it.
 */
export async function signInAs(
  page: Page,
  email: string,
  surface: 'talent' | 'studio',
  password: string = DEMO_PASSWORD,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/auth/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    try {
      await page.waitForURL(`**/${surface}`, { timeout: 30_000 })
      return
    } catch (error) {
      if (attempt === 1) throw error
      // Give the rate limiter a moment, then try once more.
      await page.waitForTimeout(3_000)
    }
  }
  await expect(page).toHaveURL(new RegExp(`/${surface}`))
}
