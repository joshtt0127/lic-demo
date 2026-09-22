import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

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
  await signInAs(talent, talentEmail, 'talent')

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
  await signInAs(production, `e2e.tape.prod.${stamp}@letitcast.dev`, 'studio')

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

/**
 * Recording, not just uploading: the camera path must produce the same thing —
 * one `self_tapes` row on the application, playable by the production.
 *
 * Chromium's fake capture device stands in for a webcam, so this runs headless
 * and on CI like any other test.
 */
test.describe('camera', () => {
  // The fake capture device is declared in playwright.config.ts.
  test.use({ permissions: ['camera', 'microphone'] })

  test('a talent records a self-tape with their camera', async ({ page }) => {
    const stamp = Date.now()
    const env = localEnv()
    const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: producer } = await admin.auth.admin.createUser({
      email: `e2e.cam.prod.${stamp}@letitcast.dev`,
      password: DEMO_PASSWORD,
      email_confirm: true,
    })
    const producerId = producer!.user.id
    const { data: org } = await admin
      .from('organizations')
      .insert({ name: `Cam Films ${stamp}`, slug: `cam-films-${stamp}`, created_by: producerId })
      .select('id')
      .single()
    const { data: project } = await admin
      .from('projects')
      .insert({ org_id: org!.id, created_by: producerId, title: `Close Up ${stamp}` })
      .select('id')
      .single()
    const { data: casting } = await admin
      .from('casting_calls')
      .insert({
        project_id: project!.id,
        created_by: producerId,
        title: `Close Up ${stamp} — open call`,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    const { data: role } = await admin
      .from('roles')
      .insert({ casting_call_id: casting!.id, name: `Jun ${stamp}` })
      .select('id')
      .single()

    const talentEmail = `e2e.cam.talent.${stamp}@letitcast.dev`
    const { data: created } = await admin.auth.admin.createUser({
      email: talentEmail,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'Remi', last_name: 'Cam' },
    })
    const talentId = created!.user.id
    await admin
      .from('profiles')
      .update({
        account_type: 'talent',
        first_name: 'Remi',
        last_name: 'Cam',
        onboarding_step: null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', talentId)
    await admin
      .from('talent_profiles')
      .upsert({ profile_id: talentId }, { onConflict: 'profile_id' })
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

    await signInAs(page, talentEmail, 'talent')

    await page.goto('/talent/auditions')
    await page.getByRole('button', { name: 'Record my self-tape' }).click()

    // The camera really starts, then the take really records.
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({
      timeout: 20_000,
    })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Stop recording' }).click()

    await expect(page.getByRole('button', { name: 'Use this take' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Use this take' }).click()
    await expect(page.getByText('Self-tape sent to the production')).toBeVisible({
      timeout: 30_000,
    })

    const { data: tapes } = await admin
      .from('self_tapes')
      .select('id, media_assets ( bucket, mime, bytes )')
      .eq('application_id', application!.id)
    expect(tapes).toHaveLength(1)
    const asset = (tapes![0] as unknown as { media_assets: { bucket: string; mime: string; bytes: number } })
      .media_assets
    expect(asset.bucket).toBe('selftapes')
    expect(asset.mime).toMatch(/^video\/(mp4|webm)$/)
    expect(asset.bytes).toBeGreaterThan(0)

    await admin.from('projects').delete().eq('id', project!.id)
    await admin.from('organizations').delete().eq('id', org!.id)
    await admin.auth.admin.deleteUser(talentId)
    await admin.auth.admin.deleteUser(producerId)
  })
})
