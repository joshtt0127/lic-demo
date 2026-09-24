import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le lien d'invitation, de l'e-mail à l'appartenance.
 *
 * Ce que le test protège vraiment : le **rôle vient de l'invitation**, jamais
 * de celui qui clique ; un jeton qui circule ne suffit pas si l'adresse ne
 * correspond pas ; et cliquer deux fois ne casse rien.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function makeAccount(email: string, firstName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: 'Invite' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      first_name: firstName,
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', data.user.id)
  return data.user.id
}

test('an emailed invitation link brings someone in, at the invited role', async ({
  page,
  browser,
}) => {
  const stamp = Date.now()
  const ownerEmail = `e2e.inv.owner.${stamp}@letitcast.dev`
  const guestEmail = `e2e.inv.guest.${stamp}@letitcast.dev`
  const outsiderEmail = `e2e.inv.outsider.${stamp}@letitcast.dev`

  const ownerId = await makeAccount(ownerEmail, 'Olive')
  const guestId = await makeAccount(guestEmail, 'Gaby')
  const outsiderId = await makeAccount(outsiderEmail, 'Otto')

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Invite Films ${stamp}`, slug: `invite-films-${stamp}`, created_by: ownerId, verification_status: 'verified' })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' })

  // ── L'owner invite, depuis son écran Équipe ──
  await signInAs(page, ownerEmail, 'studio')
  await page.goto('/studio/team')
  await page.getByLabel('Email').fill(guestEmail)
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByText(guestEmail).first()).toBeVisible({ timeout: 20_000 })

  const { data: invite } = await admin
    .from('organization_invites')
    .select('token, role, accepted_at')
    .eq('org_id', org!.id)
    .eq('email', guestEmail)
    .single()
  expect(invite?.token, 'the invitation carries a token').toBeTruthy()

  // L'e-mail préparé pointe vers la page qui traite ce jeton.
  const { data: outbox } = await admin
    .from('email_outbox')
    .select('html')
    .eq('kind', 'team_invite')
    .ilike('html', `%${invite!.token}%`)
    .limit(1)
  expect(outbox?.[0]?.html, 'the invitation email links to /invite/<token>').toContain(
    `/invite/${invite!.token}`,
  )

  // ── Quelqu'un d'autre a le lien : l'adresse ne correspond pas ──
  const outsiderContext = await browser.newContext()
  const outsiderPage = await outsiderContext.newPage()
  await signInAs(outsiderPage, outsiderEmail, 'studio')
  await outsiderPage.goto(`/invite/${invite!.token}`)
  await expect(outsiderPage.getByText('This invitation cannot be used')).toBeVisible({
    timeout: 20_000,
  })
  const { data: stolen } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('org_id', org!.id)
    .eq('profile_id', outsiderId)
  expect(stolen ?? [], 'a circulating token is not a key').toHaveLength(0)
  await outsiderContext.close()

  // ── L'invité ouvre son lien ──
  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await signInAs(guestPage, guestEmail, 'studio')
  await guestPage.goto(`/invite/${invite!.token}`)
  await guestPage.waitForURL('**/studio', { timeout: 30_000 })

  const { data: membership } = await admin
    .from('organization_members')
    .select('role, status')
    .eq('org_id', org!.id)
    .eq('profile_id', guestId)
    .single()
  expect(membership?.role, 'the invitation decides the role').toBe(invite!.role)
  expect(membership?.status).toBe('active')

  const { data: used } = await admin
    .from('organization_invites')
    .select('accepted_at')
    .eq('token', invite!.token)
    .single()
  expect(used?.accepted_at, 'the invitation is consumed').not.toBeNull()

  // Cliquer une seconde fois ne crée pas de doublon et ne casse rien.
  await guestPage.goto(`/invite/${invite!.token}`)
  await guestPage.waitForTimeout(2_000)
  const { data: rows } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('org_id', org!.id)
    .eq('profile_id', guestId)
  expect(rows ?? [], 'no duplicate membership').toHaveLength(1)
  await guestContext.close()

  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, guestId, outsiderId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})
