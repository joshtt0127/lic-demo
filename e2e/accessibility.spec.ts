import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * L'accessibilité, mesurée plutôt que supposée.
 *
 * On ne cherche pas le sans-faute : axe remonte aussi des points de style qui
 * demandent un arbitrage. On bloque sur ce qui **empêche** quelqu'un d'utiliser
 * l'app — contraste illisible, champ sans étiquette, bouton sans nom, structure
 * de page cassée — c'est-à-dire les niveaux `serious` et `critical`.
 *
 * Les écrans choisis sont ceux qu'un comédien traverse vraiment : c'est là que
 * l'exclusion coûte le plus cher.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function scan(page: Page, label: string) {
  // Les écrans entrent en fondu : mesurer pendant l'animation donne des couleurs
  // à moitié transparentes et des contrastes faux. On attend que ça se pose.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 })
    .catch(() => undefined)
  await page.waitForTimeout(400)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )

  // Le message porte l'endroit exact : un échec d'accessibilité qui ne dit pas
  // quel élément corriger ne sert à rien.
  const detail = blocking
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}) — ${violation.help}\n    ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join('\n    ')}`,
    )
    .join('\n  ')

  expect(blocking, `${label} must be usable:\n  ${detail}`).toHaveLength(0)
}

test('the screens a talent goes through are usable', async ({ page }) => {
  const stamp = Date.now()
  const email = `e2e.a11y.${stamp}@letitcast.dev`
  const { data } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Ada', last_name: 'Access' },
  })
  const id = data!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: 'Ada',
      last_name: 'Access',
      city: 'Paris',
      avatar_url: 'https://placehold.co/400',
      adult_confirmed_at: new Date().toISOString(),
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id)
  await admin
    .from('talent_profiles')
    .upsert(
      { profile_id: id, playing_age_min: 25, playing_age_max: 40, headline: 'Actress' },
      { onConflict: 'profile_id' },
    )

  await page.goto('/auth/sign-in')
  await scan(page, 'the sign-in screen')

  await signInAs(page, email, 'talent')
  await page.waitForTimeout(1500)
  await scan(page, 'the talent feed')

  await page.goto('/talent/casting-calls')
  await page.waitForTimeout(1200)
  await scan(page, 'the casting list')

  await page.goto('/talent/auditions')
  await page.waitForTimeout(1200)
  await scan(page, 'the auditions screen')

  await page.goto('/talent/profile')
  await page.waitForTimeout(1500)
  await scan(page, 'the talent profile')

  await admin.auth.admin.deleteUser(id).catch(() => {})
})

test('the screens a production works in are usable', async ({ page }) => {
  const stamp = Date.now()
  const email = `e2e.a11y.prod.${stamp}@letitcast.dev`
  const { data } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Remi', last_name: 'Access' },
  })
  const id = data!.user.id
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      first_name: 'Remi',
      last_name: 'Access',
      platform_role: 'admin',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id)

  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Access Films ${stamp}`,
      slug: `access-films-${stamp}`,
      created_by: id,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: id, role: 'owner', status: 'active' })
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: id, title: `Access Road ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: id,
      title: `Access Road ${stamp} — call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  await admin.from('roles').insert({ casting_call_id: casting!.id, name: `Part ${stamp}` })

  await signInAs(page, email, 'studio')
  await page.waitForTimeout(1500)
  await scan(page, 'the studio home')

  await page.goto('/studio/casting-calls')
  await page.waitForTimeout(1200)
  await scan(page, 'the casting list')

  await page.goto(`/studio/casting/${casting!.id}`)
  await page.waitForTimeout(1500)
  await scan(page, 'the casting dashboard')

  await page.goto('/studio/team')
  await page.waitForTimeout(1200)
  await scan(page, 'the team screen')

  // La console d'exploitation compte aussi : le support s'en sert tous les jours.
  await page.goto('/admin')
  await page.waitForTimeout(1500)
  await scan(page, 'the operations console')

  await admin.from('projects').delete().eq('id', project!.id)
  await admin.from('organizations').delete().eq('id', org!.id)
  await admin.auth.admin.deleteUser(id).catch(() => {})
})
