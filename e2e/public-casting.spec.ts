import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Une annonce partagée, ouverte sans compte.
 *
 * Le lien d'un casting tombait jusqu'ici sur un mur de connexion : on demandait
 * de créer un compte pour savoir **si** l'annonce intéressait. Ce test vérifie
 * les deux moitiés de la règle — ce qu'un visiteur voit, et surtout tout ce
 * qu'il ne voit pas.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

test('a visitor with no account reads a shared casting, and nothing else', async ({
  page,
  context,
}) => {
  const stamp = Date.now()
  const producerEmail = `e2e.pub.prod.${stamp}@letitcast.dev`
  const { data: producer } = await admin.auth.admin.createUser({
    email: producerEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Paula', last_name: 'Public' },
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

  const orgName = `Open Films ${stamp}`
  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: orgName,
      slug: `open-films-${stamp}`,
      created_by: producerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })

  const projectTitle = `Open Road ${stamp}`
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: projectTitle })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `${projectTitle} — open call`,
      description: 'Shooting in Lisbon this spring.',
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const roleName = `Driver ${stamp}`
  await admin.from('roles').insert({ casting_call_id: casting!.id, name: roleName })

  // Un casting resté en brouillon, pour vérifier qu'il ne fuit pas.
  const { data: draft } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `${projectTitle} — secret`,
      status: 'draft',
    })
    .select('id')
    .single()

  // ── Aucune session : le visiteur lit l'annonce ──
  await context.clearCookies()
  await page.goto(`/casting/${casting!.id}`)
  await expect(page.getByText(roleName).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(projectTitle).first()).toBeVisible()
  // Un lien, pas un bouton : une navigation se fait avec un lien — et un
  // <button> dans un <a> était du HTML invalide autant qu'un piège pour les
  // lecteurs d'écran.
  await expect(page.getByRole('link', { name: 'Create my account' })).toBeVisible()

  // ── Et rien d'autre : la clé publique, sans session, table par table ──
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  for (const table of [
    'applications',
    'self_tapes',
    'candidate_notes',
    'candidate_reviews',
    'talent_profiles',
    'profiles',
    'messages',
    'events',
    'notifications',
  ]) {
    const { data } = await anon.from(table).select('*').limit(1)
    expect(data ?? [], `${table} must stay closed to a visitor`).toHaveLength(0)
  }

  const { data: drafts } = await anon.from('casting_calls').select('id').eq('id', draft!.id)
  expect(drafts ?? [], 'a draft casting is not shared').toHaveLength(0)

  // ── Le retour : se connecter depuis l'annonce ramène à l'annonce ──
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`next=%2Fcasting%2F${casting!.id}`))

  const talentEmail = `e2e.pub.talent.${stamp}@letitcast.dev`
  const { data: talent } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Tom', last_name: 'Public' },
  })
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Tom',
      last_name: 'Public',
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talent!.user.id)
  await admin
    .from('talent_profiles')
    .upsert(
      { profile_id: talent!.user.id, playing_age_min: 25, playing_age_max: 40 },
      { onConflict: 'profile_id' },
    )

  await page.getByLabel('Email').fill(talentEmail)
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`**/casting/${casting!.id}`, { timeout: 30_000 })
  await expect(page.getByText(roleName).first()).toBeVisible()

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(producerId).catch(() => {})
  await admin.auth.admin.deleteUser(talent!.user.id).catch(() => {})
})
