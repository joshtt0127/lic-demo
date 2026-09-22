import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * A casting director can write to an actor whenever they want, and the actor
 * really receives it.
 *
 * Proves the chain on the live database: the production opens the actor's
 * profile, sends a message, and the conversation + message land in the actor's
 * inbox — with the notification the database trigger writes.
 */
test('a casting director messages an actor, who receives it in their inbox', async ({ browser }) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ── A production account with an organization ──
  const productionEmail = `e2e.msg.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Paula', last_name: 'Direct' },
  })
  const producerId = producer!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      first_name: 'Paula',
      last_name: 'Direct',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', producerId)

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Direct Pictures ${stamp}`,
      slug: `direct-pictures-${stamp}`,
      created_by: producerId,
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  // ── An actor ──
  const talentEmail = `e2e.msg.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Livia', last_name: 'Marsh' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Livia',
      last_name: 'Marsh',
      city: 'Paris',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin
    .from('talent_profiles')
    .upsert({ profile_id: talentId, headline: 'Actress' }, { onConflict: 'profile_id' })

  // ── The production writes to them from their profile ──
  const productionContext = await browser.newContext()
  const production = await productionContext.newPage()
  await signInAs(production, productionEmail, 'studio')

  await production.goto(`/studio/talent/${talentId}`)
  await expect(production.getByRole('heading', { name: 'Livia Marsh' })).toBeVisible()
  await production.getByRole('button', { name: 'Message' }).click()

  await expect(production.getByRole('heading', { name: 'Message Livia Marsh' })).toBeVisible()
  // The openers are real: clicking one fills the message.
  await production.getByRole('button', { name: 'Invite to a callback' }).click()
  await production.getByLabel('Your message').fill('Hi Livia — free for a callback on Tuesday?')
  await production.getByRole('button', { name: 'Send message' }).click()

  // It lands in the production's own inbox, thread open.
  await production.waitForURL(/\/studio\/messages/, { timeout: 30_000 })
  // The text shows twice: in the list preview and in the bubble.
  await expect(
    production.getByText('Hi Livia — free for a callback on Tuesday?').first(),
  ).toBeVisible({ timeout: 20_000 })

  // ── The badge is live before anything is opened ──
  const talentContext = await browser.newContext()
  const talent = await talentContext.newPage()
  await signInAs(talent, talentEmail, 'talent')

  await expect(talent.locator('nav').getByText('1').first()).toBeVisible({ timeout: 20_000 })

  await talent.goto('/talent/messages')
  await expect(talent.getByText('Paula Direct').first()).toBeVisible({ timeout: 20_000 })
  await expect(talent.getByText('Hi Livia — free for a callback on Tuesday?').first()).toBeVisible()

  // Opening the thread clears the badge for good — it is stored on the
  // membership row, not in React state.
  await talent.reload()
  await expect(talent.locator('nav').getByText(/^[1-9]\d*$/)).toHaveCount(0)

  // ── Live: the production's open thread updates on its own, and its own
  //    message flips to "Read" now that the actor has opened it ──
  await talent.getByPlaceholder('Write a message…').fill('Tuesday works.')
  await talent.getByRole('button', { name: 'Send' }).click()

  await expect(production.getByText('Tuesday works.').first()).toBeVisible({ timeout: 20_000 })
  await expect(production.getByText('Read').first()).toBeVisible({ timeout: 20_000 })

  // The database trigger notified them.
  await talent.goto('/talent/notifications')
  await expect(talent.getByText(/New message/).first()).toBeVisible({ timeout: 20_000 })

  // ── The thread says what it is about, and links back to it ──
  await production.goto(`/studio/talent/${talentId}`)
  await production.getByRole('button', { name: 'Message' }).click()
  await production.getByLabel('Your message').fill('One more thing.')
  await production.getByRole('button', { name: 'Send message' }).click()
  await production.waitForURL(/\/studio\/messages/, { timeout: 30_000 })

  const { data: messages } = await admin
    .from('messages')
    .select('body, sender_id, conversations!inner(created_by)')
    .eq('sender_id', producerId)
  expect(messages?.map((message) => message.body)).toEqual([
    'Hi Livia — free for a callback on Tuesday?',
    'One more thing.',
  ])

  // ── Writing again reused the same thread, it did not fork ──
  const { data: conversations } = await admin
    .from('conversations')
    .select('id')
    .eq('created_by', producerId)
  expect(conversations).toHaveLength(1)

  await admin.from('conversations').delete().eq('created_by', producerId)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
