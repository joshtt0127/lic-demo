import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le dixième scénario du cahier des charges : une opération média qui échoue.
 *
 * C'est le seul des dix qui n'était pas couvert, et c'est le plus proche du
 * vécu : une tape de plusieurs centaines de méga-octets, un réseau qui lâche.
 * Ce qu'on vérifie n'est pas que ça marche — c'est que **quand ça rate**, le
 * comédien l'apprend, qu'aucune ligne fantôme ne reste en base, et qu'il peut
 * recommencer.
 *
 * L'envoi est coupé au niveau du réseau plutôt que simulé côté application :
 * une panne qu'on fabrique dans le code ne prouve rien sur la vraie.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

test('an upload that fails says so, leaves nothing behind, and can be retried', async ({
  page,
}) => {
  const stamp = Date.now()
  const producerEmail = `e2e.fail.prod.${stamp}@letitcast.dev`
  const talentEmail = `e2e.fail.talent.${stamp}@letitcast.dev`

  const { data: producer } = await admin.auth.admin.createUser({
    email: producerEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Fay', last_name: 'Fail' },
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

  const { data: created } = await admin.auth.admin.createUser({
    email: talentEmail,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Tim', last_name: 'Fail' },
  })
  const talentId = created!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Tim',
      last_name: 'Fail',
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
      name: `Broken Films ${stamp}`,
      slug: `broken-films-${stamp}`,
      created_by: producerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: producerId, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: producerId, title: `Dropped ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: producerId,
      title: `Dropped ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Runner ${stamp}` })
    .select('id')
    .single()
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

  // ── Le réseau lâche pendant l'envoi ──
  let failNext = true
  await page.route('**/storage/v1/object/selftapes/**', async (route) => {
    if (failNext && route.request().method() === 'POST') {
      await route.abort('connectionfailed')
      return
    }
    await route.continue()
  })

  const tape = {
    name: 'take.webm',
    mimeType: 'video/webm',
    buffer: Buffer.alloc(64 * 1024, 7),
  }
  await page.getByLabel(/MP4, MOV or WebM/i).first().setInputFiles(tape)

  // Ce que le comédien doit lire : une phrase qui dit quoi faire. L'app affiche
  // la cause réelle (« vérifiez votre connexion ») plutôt que le message
  // générique de repli — c'est mieux, et c'est donc ce qu'on vérifie.
  await expect(page.getByText(/Upload failed — check your connection|Could not send your tape/)).toBeVisible({
    timeout: 30_000,
  })

  // Et rien ne doit rester derrière : ni tape, ni média orphelin.
  const { data: ghostTapes } = await admin
    .from('self_tapes')
    .select('id')
    .eq('application_id', application!.id)
  expect(ghostTapes ?? [], 'a failed upload leaves no half-sent tape').toHaveLength(0)

  const { data: ghostMedia } = await admin
    .from('media_assets')
    .select('id')
    .eq('owner_id', talentId)
    .eq('kind', 'selftape')
  expect(ghostMedia ?? [], 'and no orphan media row').toHaveLength(0)

  // ── Le réseau revient : on recommence, et ça passe ──
  failNext = false
  await page.getByLabel(/MP4, MOV or WebM/i).first().setInputFiles(tape)

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('self_tapes')
        .select('id')
        .eq('application_id', application!.id)
      return data?.length ?? 0
    }, { timeout: 40_000, message: 'the retry must succeed' })
    .toBe(1)

  await expect(page.getByText(/Upload failed|Could not send your tape/)).toHaveCount(0)

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [producerId, talentId]) await admin.auth.admin.deleteUser(id).catch(() => {})
})
