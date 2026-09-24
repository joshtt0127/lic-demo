import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Email: what leaves the app.
 *
 * The outbox is the record of what would be sent — it is written whether or not
 * a provider key is configured, so this proves the whole chain except the
 * provider's own HTTP call (checked separately against a sink, see
 * docs/DATABASE.md).
 *
 * It also proves the opt-out: `profiles.email_notifications` is read by the
 * database trigger, so turning the switch off stops the email at the source.
 */
test('a message produces an email, and the opt-out stops it', async ({ page, browser }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const productionEmail = `e2e.mail.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Elsa', last_name: 'Post' },
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
    .insert({ name: `Post Films ${stamp}`, slug: `post-films-${stamp}`, created_by: producerId, verification_status: 'verified' })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  const talentEmail = `e2e.mail.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Noor', last_name: 'Post' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      // Comme après un onboarding réel : le MVP est réservé aux majeurs.
      adult_confirmed_at: new Date().toISOString(),
      first_name: 'Noor',
      last_name: 'Post',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin.from('talent_profiles').upsert({ profile_id: talentId }, { onConflict: 'profile_id' })

  // ── The production writes to the actor ──
  await signInAs(page, productionEmail, 'studio')
  await page.goto(`/studio/talent/${talentId}`)
  await page.getByRole('button', { name: 'Message' }).click()
  await page.getByLabel('Your message').fill('Your tape made the room laugh.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForURL(/\/studio\/messages/, { timeout: 30_000 })

  // ── An email is queued for the actor, with the thread's link in it ──
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('email_outbox')
          .select('id')
          .eq('to_email', talentEmail)
        return data?.length ?? 0
      },
      { timeout: 20_000 },
    )
    .toBe(1)

  const { data: rows } = await admin
    .from('email_outbox')
    .select('to_email, subject, html, kind, status, notification_id')
    .eq('to_email', talentEmail)
  expect(rows).toHaveLength(1)
  expect(rows![0].kind).toBe('message')
  expect(rows![0].subject).toContain('Elsa Post')
  expect(rows![0].html).toContain('/talent/messages')
  expect(rows![0].notification_id).not.toBeNull()
  // No provider key on this project: the row says so instead of pretending.
  expect(['skipped', 'dispatched', 'sent']).toContain(rows![0].status)

  // ── The actor turns emails off, from their notifications screen ──
  const talentContext = await browser.newContext()
  const talentPage = await talentContext.newPage()
  await signInAs(talentPage, talentEmail, 'talent')
  await talentPage.goto('/talent/notifications')
  const toggle = talentPage.getByRole('switch', { name: 'Email me' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(talentPage.getByText('Emails turned off')).toBeVisible({ timeout: 20_000 })

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('profiles')
        .select('email_notifications')
        .eq('id', talentId)
        .single()
      return data?.email_notifications
    }, { timeout: 20_000 })
    .toBe(false)

  // A second message still reaches the inbox, but no longer the mailbox.
  await page.goto(`/studio/talent/${talentId}`)
  await page.getByRole('button', { name: 'Message' }).click()
  await page.getByLabel('Your message').fill('One more thing.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForURL(/\/studio\/messages/, { timeout: 30_000 })

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('messages')
        .select('id')
        .eq('sender_id', producerId)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(2)

  const { data: after } = await admin
    .from('email_outbox')
    .select('id')
    .eq('to_email', talentEmail)
  expect(after, 'the opt-out is honoured by the trigger').toHaveLength(1)

  // ── Cleanup ──
  await admin.from('email_outbox').delete().eq('to_email', talentEmail)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
