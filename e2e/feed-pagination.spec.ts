import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le fil se lit par pages.
 *
 * Avant, la liste des annonces ouvertes partait sans limite : toutes les
 * annonces publiées, avec leurs rôles et leur projet, à chaque ouverture du
 * fil. Ça marche à trente annonces et s'écroule à dix mille.
 *
 * Ce test crée plus d'annonces qu'une page n'en tient, et vérifie les deux
 * moitiés : la première page est bornée, et « Voir plus » rend bien la suite —
 * paginer sans bouton reviendrait à cacher le reste.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

test('the casting list comes in pages, and shows more on demand', async ({ page }) => {
  const stamp = Date.now()
  const producerEmail = `e2e.page.prod.${stamp}@letitcast.dev`
  const talentEmail = `e2e.page.talent.${stamp}@letitcast.dev`

  const { data: producer } = await admin.auth.admin.createUser({
    email: producerEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Pia', last_name: 'Page' },
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

  const { data: talent } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Tao', last_name: 'Page' },
  })
  const talentId = talent!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Tao',
      last_name: 'Page',
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)
  await admin
    .from('talent_profiles')
    .upsert(
      { profile_id: talentId, playing_age_min: 25, playing_age_max: 40 },
      { onConflict: 'profile_id' },
    )

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Paged Films ${stamp}`,
      slug: `paged-films-${stamp}`,
      created_by: producerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: `Long Run ${stamp}` })
    .select('id')
    .single()

  // 25 annonces : plus qu'une page (20).
  const rows = Array.from({ length: 25 }, (_, index) => ({
    project_id: project!.id,
    created_by: producerId,
    title: `Paged ${stamp} — ${String(index).padStart(2, '0')}`,
    status: 'published' as const,
    visibility: 'public' as const,
    published_at: new Date(Date.now() - index * 60_000).toISOString(),
  }))
  await admin.from('casting_calls').insert(rows)

  await signInAs(page, talentEmail, 'talent')
  await page.goto('/talent/casting-calls')

  const cards = page.locator(`text=/Paged ${stamp} — /`)
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })

  // La première page est bornée — et sûrement pas les 25.
  const firstPage = await cards.count()
  expect(firstPage, 'the first page is bounded').toBeLessThanOrEqual(20)

  await page.getByRole('button', { name: 'Show more' }).click()
  await expect
    .poll(async () => cards.count(), { timeout: 20_000 })
    .toBeGreaterThan(firstPage)

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [producerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
