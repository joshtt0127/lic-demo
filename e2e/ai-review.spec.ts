import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le bouton « analyser la tape ».
 *
 * Ce qui est vérifié ici est tout ce qui ne dépend pas de la clé du modèle :
 * les images clés sont bien extraites de la vidéo **dans le navigateur** (donc
 * la vidéo ne transite pas), la fonction est appelée, et son verdict est écrit
 * par elle — pas par le client. Sans clé, la ligne finit en `failed` avec la
 * raison exacte, et l'écran l'affiche au lieu d'inventer un avis.
 */
test('analysing a tape extracts frames, calls the function, and records the outcome', async ({
  page,
  browser,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ── Une production, un rôle, une candidature ──
  const productionEmail = `e2e.ai.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: productionEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Ada', last_name: 'Read' },
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
    .insert({ name: `Read Films ${stamp}`, slug: `read-films-${stamp}`, created_by: producerId })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: `Dry Run ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `Dry Run ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({
      casting_call_id: casting!.id,
      name: `Iris ${stamp}`,
      description: 'Cold on the surface, cracking underneath.',
    })
    .select('id')
    .single()

  const talentEmail = `e2e.ai.talent.${stamp}@letitcast.dev`
  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Vera', last_name: 'Frame' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Vera',
      last_name: 'Frame',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin.from('talent_profiles').upsert({ profile_id: talentId }, { onConflict: 'profile_id' })
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

  // ── La comédienne enregistre sa tape (caméra factice de Chromium) ──
  await signInAs(page, talentEmail, 'talent')
  await page.goto('/talent/auditions')
  await page.getByRole('button', { name: 'Record my self-tape' }).click()
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await page.getByRole('button', { name: 'Use this take' }).click()
  await expect(page.getByText('Self-tape sent to the production')).toBeVisible({ timeout: 30_000 })

  const { data: tapes } = await admin
    .from('self_tapes')
    .select('id')
    .eq('application_id', application!.id)
  expect(tapes).toHaveLength(1)

  // ── La production demande l'analyse, dans son propre navigateur ──
  const studioContext = await browser.newContext()
  const studio = await studioContext.newPage()
  await signInAs(studio, productionEmail, 'studio')
  await studio.goto(`/studio/casting/${casting!.id}`)
  await studio.getByRole('button', { name: /^Submissions/ }).click()
  await studio.getByRole('button', { name: 'Review' }).first().click()

  await expect(studio.getByText('AI read of the tape')).toBeVisible({ timeout: 20_000 })
  await studio.getByLabel('Traits to assess').fill('authority, fragility')
  await studio.getByRole('button', { name: /Analyse this tape/ }).click()

  // La fonction écrit elle-même le verdict — le client ne peut pas le forger.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('tape_ai_reviews')
          .select('status, traits_asked, requested_by, error')
          .eq('self_tape_id', tapes![0].id)
        return data?.[0] ?? null
      },
      { timeout: 60_000 },
    )
    .toMatchObject({
      status: 'failed',
      traits_asked: ['authority', 'fragility'],
      requested_by: producerId,
    })

  const { data: review } = await admin
    .from('tape_ai_reviews')
    .select('error')
    .eq('self_tape_id', tapes![0].id)
    .single()
  // Sans clé, la raison est dite — aucun avis n'est inventé.
  expect(review?.error).toContain('ANTHROPIC_API_KEY')
  await expect(studio.getByText(/ANTHROPIC_API_KEY/)).toBeVisible({ timeout: 20_000 })

  // ── Ménage ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
