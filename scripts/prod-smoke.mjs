/**
 * Ce qui casse vraiment, chez un vrai utilisateur, sur la vraie production.
 *
 *   node scripts/prod-smoke.mjs [url]
 *
 * Les audits existants regardent la mise en page et les contrôles morts ; les
 * tests E2E vérifient des parcours précis. Ni les uns ni les autres ne disent
 * ce qu'un navigateur crache dans sa console en visitant simplement chaque
 * écran — or c'est exactement là qu'était le bug de MIME type : invisible en
 * local, invisible aux tests, visible seulement chez quelqu'un dont l'onglet
 * était ouvert pendant un déploiement.
 *
 * Ce script ouvre donc toutes les routes, avec de vraies sessions, et ramasse
 * trois choses qu'un utilisateur ressentirait : une erreur JavaScript, une
 * erreur de console, une requête refusée. Rien d'autre — pas d'avertissement,
 * pas de dépréciation : on cherche ce qui casse, pas ce qui grommelle.
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'https://lic-demo-omega.vercel.app'
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const PASSWORD = env.DEMO_PASSWORD || 'LetItCast2026!'

const PUBLIC = ['/', '/pitch', '/auth/sign-in', '/auth/sign-up', '/auth/forgot-password']
const STUDIO = [
  '/studio',
  '/studio/casting-calls',
  '/studio/casting-calls/new',
  '/studio/projects',
  '/studio/talent',
  '/studio/calendar',
  '/studio/reports',
  '/studio/team',
  '/studio/settings',
  '/studio/messages',
  '/studio/notifications',
]
const TALENT = [
  '/talent',
  '/talent/casting-calls',
  '/talent/auditions',
  '/talent/messages',
  '/talent/notifications',
  '/talent/profile',
  '/app',
]

/**
 * Le bruit qu'on accepte.
 *
 * Volontairement court. Chaque ligne ici est une chose qu'on choisit de ne pas
 * voir, et une liste qui s'allonge finit par cacher le prochain vrai bug.
 */
const IGNORED = [
  'React Router Future Flag Warning',
  'Download the React DevTools',
  'favicon.ico',
]
const ignorable = (text) => IGNORED.some((pattern) => text.includes(pattern))

const browser = await chromium.launch()
const findings = []

async function visit(label, routes, email) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  let route = '(connexion)'

  page.on('pageerror', (error) => {
    if (!ignorable(error.message)) findings.push({ label, route, kind: 'js', detail: error.message.slice(0, 160) })
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!ignorable(text)) findings.push({ label, route, kind: 'console', detail: text.slice(0, 160) })
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const url = response.url()
    if (ignorable(url)) return
    findings.push({ label, route, kind: `http ${response.status()}`, detail: url.replace(BASE, '').slice(0, 120) })
  })

  if (email) {
    await page.goto(`${BASE}/auth/sign-in`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/(talent|studio|app)/, { timeout: 40000 })
  }

  for (const path of routes) {
    route = path
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    // Les écrans chargent leurs données après le rendu : sans cette attente on
    // raterait précisément les erreurs qui comptent.
    await page.waitForTimeout(2600)
  }

  /**
   * Les écrans qui ont besoin d'un identifiant, et ceux qui s'ouvrent.
   *
   * Charger une liste ne prouve pas grand-chose : les pages de casting, la
   * console de sélection et le panneau d'intelligence sont les plus denses du
   * produit, donc les plus susceptibles de casser. Les visiter demande de
   * trouver un identifiant réel, ce qu'on fait en suivant le premier lien.
   */
  if (label === 'studio') {
    route = '/studio/casting-calls'
    await page.goto(`${BASE}/studio/casting-calls`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const href = await page
      .locator('a[href^="/studio/casting/"]')
      .first()
      .getAttribute('href')
      .catch(() => null)
    const id = href?.split('/studio/casting/')[1]?.split('/')[0]

    if (id) {
      for (const path of [
        `/studio/casting/${id}`,
        `/studio/casting/${id}?tab=submissions`,
        `/studio/casting/${id}/console`,
      ]) {
        route = path
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2600)
      }
    }

    route = '/studio (panneau Intelligence Live)'
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2600)
    const open = page.getByRole('button', { name: /See the engine/i })
    if (await open.count()) {
      await open.click()
      await page.waitForTimeout(2600)
    }
  }

  await page.close()
}

await visit('public', PUBLIC, null)
await visit('studio', STUDIO, 'peter@letitcast.demo')
await visit('talent', TALENT, 'maya@letitcast.demo')
await browser.close()

if (findings.length === 0) {
  console.log(`\n✓ ${BASE} — aucune erreur sur ${PUBLIC.length + STUDIO.length + TALENT.length} routes`)
  process.exit(0)
}

// Regroupé par message : vingt occurrences d'un même défaut sont un défaut.
const grouped = new Map()
for (const finding of findings) {
  const key = `${finding.kind}|${finding.detail}`
  const entry = grouped.get(key) ?? { ...finding, routes: new Set() }
  entry.routes.add(`${finding.label}${finding.route}`)
  grouped.set(key, entry)
}

console.log(`\n${grouped.size} problème(s) distinct(s) sur ${BASE} :\n`)
for (const entry of grouped.values()) {
  console.log(`  [${entry.kind}] ${entry.detail}`)
  console.log(`     sur : ${[...entry.routes].slice(0, 6).join(', ')}${entry.routes.size > 6 ? ` … (+${entry.routes.size - 6})` : ''}`)
}
process.exit(1)
