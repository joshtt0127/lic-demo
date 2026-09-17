import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Self-tapes, end to end and for real.
 *
 * The talent uploads a tape on their audition, replaces it, and the production
 * plays that very tape from the private bucket — the signed URL only exists
 * because the tape is tied to the application through `self_tapes`.
 */

/** A tiny file that is a valid upload (the bucket checks the declared type). */
const TAPE = Buffer.from('00000018667479706d703432000000006d703432', 'hex')

test('a talent sends a self-tape, replaces it, and the production plays it', async ({
  browser,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ── A production, a published casting, a role ──
  const { data: producer } = await admin.auth.admin.createUser({
    email: `e2e.tape.prod.${stamp}@letitcast.dev`,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Tess', last_name: 'Prod' },
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
    .insert({ name: `Tape Films ${stamp}`, slug: `tape-films-${stamp}`, created_by: producerId })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: `Night Bus ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `Night Bus ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({
      casting_call_id: casting!.id,
      name: `Driver ${stamp}`,
      selftape_instructions: 'Scene 4, two takes, eye line to camera.',
    })
    .select('id')
    .single()

  // ── A talent who already applied ──
  const talentEmail = `e2e.tape.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Tamsin', last_name: 'Reel' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Tamsin',
      last_name: 'Reel',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin
    .from('talent_profiles')
    .upsert({ profile_id: talentId, headline: 'Actress' }, { onConflict: 'profile_id' })
  const { data: application } = await admin
    .from('applications')
    .insert({
      role_id: role!.id,
      talent_id: talentId,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  // ── The talent uploads their tape from the audition ──
  const talentContext = await browser.newContext()
  const talent = await talentContext.newPage()
  await talent.goto('/auth/sign-in')
  await talent.getByLabel('Email').fill(talentEmail)
  await talent.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await talent.getByRole('button', { name: 'Sign in' }).click()
  await talent.waitForURL('**/talent', { timeout: 30_000 })

  await talent.goto('/talent/auditions')
  await expect(talent.getByText('No self-tape')).toBeVisible({ timeout: 20_000 })
  // The role's brief is shown where the tape is sent.
  await expect(talent.getByText('Scene 4, two takes')).toBeVisible()

  await talent.locator('input[type="file"]').first().setInputFiles({
    name: 'take-1.mp4',
    mimeType: 'video/mp4',
    buffer: TAPE,
  })
  await expect(talent.getByText('Self-tape sent to the production')).toBeVisible({
    timeout: 30_000,
  })
  await expect(talent.getByRole('button', { name: 'Replace' })).toBeVisible()

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('self_tapes')
        .select('id')
        .eq('application_id', application!.id)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  // ── Replacing keeps exactly one tape on the application ──
  await talent.locator('input[type="file"]').first().setInputFiles({
    name: 'take-2.mp4',
    mimeType: 'video/mp4',
    buffer: TAPE,
  })
  await expect(talent.getByText('Self-tape replaced')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('self_tapes')
        .select('id')
        .eq('application_id', application!.id)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  // The audition now says a tape was sent.
  await talent.reload()
  await expect(talent.getByText(/Self-tape sent/).first()).toBeVisible({ timeout: 20_000 })

  // ── The production sees and can open it ──
  const productionContext = await browser.newContext()
  const production = await productionContext.newPage()
  await production.goto('/auth/sign-in')
  await production.getByLabel('Email').fill(`e2e.tape.prod.${stamp}@letitcast.dev`)
  await production.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await production.getByRole('button', { name: 'Sign in' }).click()
  await production.waitForURL('**/studio', { timeout: 30_000 })

  await production.goto(`/studio/casting/${casting!.id}`)
  await production.getByRole('button', { name: /^Submissions/ }).click()
  await expect(production.getByText('Tamsin Reel').first()).toBeVisible({ timeout: 20_000 })
  await expect(production.getByText('Self-tape').first()).toBeVisible()

  await production.getByRole('button', { name: 'Review' }).first().click()
  await expect(production.getByRole('heading', { name: /Tamsin Reel/ })).toBeVisible()
  const video = production.locator('video').first()
  await expect(video).toBeVisible({ timeout: 20_000 })
  const src = await video.getAttribute('src')
  expect(src).toContain('/storage/v1/object/sign/selftapes/')

  // ── Cleanup ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
