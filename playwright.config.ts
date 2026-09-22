import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against a real browser and the real Supabase project — the only way to
 * prove the POC claim: a parcours works and its data survives a reload.
 *
 * Needs `.env.local` (see docs/DATABASE.md) and the seeded demo accounts
 * (`npm run db:seed`).
 */
const PORT = Number(process.env.E2E_PORT ?? 5180)

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    // A fake camera + microphone, so the self-tape recorder can be tested for
    // real instead of being mocked out.
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
