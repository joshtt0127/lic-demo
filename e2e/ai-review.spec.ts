import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le bouton « analyser la tape ».
 *
 * Le test tient dans les deux états du monde, parce que la clé du modèle est une
 * configuration serveur et non une donnée du test :
 *   · clé posée  → l'avis revient `ready`, avec **une justification par note** ;
 *   · pas de clé → la ligne finit en `failed` avec la raison exacte, et l'écran
 *     l'affiche au lieu d'inventer un avis.
 * Dans les deux cas on vérifie ce qui compte : les images sont extraites **dans
 * le navigateur** (la vidéo ne transite pas), la fonction est appelée, et c'est
 * elle qui écrit le verdict — jamais le client.
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
          .select('status')
          .eq('self_tape_id', tapes![0].id)
        return data?.[0]?.status ?? 'pending'
      },
      { timeout: 90_000 },
    )
    .not.toBe('pending')

  const { data: review } = await admin
    .from('tape_ai_reviews')
    .select('*')
    .eq('self_tape_id', tapes![0].id)
    .single()

  expect(review?.requested_by).toBe(producerId)
  expect(review?.traits_asked).toEqual(['authority', 'fragility'])

  if (review?.status === 'ready') {
    // Jamais une note sans sa justification: c'est la règle de l'écran.
    expect(review.model).toBeTruthy()
    expect(review.frames).toBeGreaterThan(0)
    expect(review.summary).toBeTruthy()
    expect(review.traits.length).toBeGreaterThan(0)
    for (const trait of review.traits) {
      expect(trait.trait, 'every trait is named').toBeTruthy()
      expect(trait.evidence, `"${trait.trait}" must say what was seen`).toBeTruthy()
    }
    await expect(studio.getByText(/fit \d+\/100/)).toBeVisible({ timeout: 20_000 })
  } else {
    // Pas de clé configurée: la raison est dite, aucun avis n'est inventé.
    expect(review?.error).toContain('GEMINI_API_KEY')
    await expect(studio.getByText(/GEMINI_API_KEY/)).toBeVisible({ timeout: 20_000 })
  }

  // ── Ménage ──
  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(talentId)
  await admin.auth.admin.deleteUser(producerId)
})
