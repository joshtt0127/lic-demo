/**
 * Finds square corners on every mounted route.
 *
 * Reports any box that reads as a surface — it has a background, a border or a
 * ring, and is bigger than a hairline — but whose corners are not rounded.
 * Full-bleed elements (page background, a card's own edge-to-edge image) are
 * ignored: they are clipped by a rounded parent.
 */
import { chromium } from '@playwright/test'

const TALENT = ['/talent', '/talent/casting-calls', '/talent/auditions', '/talent/messages', '/talent/notifications', '/talent/profile']
const STUDIO = ['/studio', '/studio/casting-calls', '/studio/casting-calls/new', '/studio/projects', '/studio/talent', '/studio/calendar', '/studio/team', '/studio/settings', '/studio/messages', '/studio/notifications']
const PUBLIC = ['/', '/auth/sign-in', '/auth/sign-up', '/onboarding']

async function signIn(page, email) {
  await page.goto('http://localhost:5180/auth/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('LetItCast2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/(talent|studio)/, { timeout: 30000 })
}

async function probe(page) {
  return page.evaluate(() => {
    const out = []
    const seen = new Set()

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width < 14 || r.height < 14) continue

      const s = getComputedStyle(el)
      const radius = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]
      const smallest = Math.min(...radius.map((value) => parseFloat(value) || 0))
      if (smallest >= 8) continue
      if (smallest > 0) {
        // Timid corners: rounded, but not enough to read as rounded.
        if (r.width < 24 || r.height < 24) continue
        const timid = `timid ${Math.round(smallest)}px: ${el.tagName.toLowerCase()} ${(el.className || '').toString().slice(0, 60)}`
        if (!seen.has(timid)) { seen.add(timid); out.push(timid) }
        continue
      }

      const hasFill = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
      // A border on one or two sides is a divider, not a box that needs corners.
      const sides = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]
        .filter((w) => parseFloat(w) > 0).length
      const hasBorder = sides === 4
      const hasRing = s.boxShadow !== 'none'
      // The brand mark is a transparent SVG: its box is not a visible square.
      const isMedia =
        ['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName) && el.alt !== 'Let It Cast mark'
      if (!hasFill && !hasBorder && !hasRing && !isMedia) continue

      // Full-height edge panels (the studio rail) and full-width bars are the
      // app's frame, not cards.
      if (r.height >= window.innerHeight - 1 || r.width >= window.innerWidth - 1) continue

      // A hairline divider is a border, not a box.
      if (r.height < 3 || r.width < 3) continue

      // Clipped by a rounded ancestor that hides its own overflow.
      let clipped = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (ps.overflow !== 'visible' && parseFloat(ps.borderTopLeftRadius) > 0) {
          const pr = p.getBoundingClientRect()
          if (r.left >= pr.left - 1 && r.right <= pr.right + 1) { clipped = true; break }
        }
      }
      if (clipped) continue

      // The page shell itself.
      if (r.width >= document.documentElement.clientWidth - 1) continue

      const key = `${el.tagName.toLowerCase()} ${(el.className || '').toString().slice(0, 70)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`square: ${key} [${Math.round(r.width)}×${Math.round(r.height)}]`)
    }
    return out.slice(0, 12)
  })
}

const browser = await chromium.launch()
for (const [label, email, routes] of [
  ['public', null, PUBLIC],
  ['talent', 'maya@letitcast.demo', TALENT],
  ['studio', 'peter@letitcast.demo', STUDIO],
]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  if (email) await signIn(page, email)

  // The casting-scoped screens need a real id — take the org's first casting.
  const scoped = []
  if (label === 'studio') {
    await page.goto('http://localhost:5180/studio/casting-calls')
    await page.waitForTimeout(1500)
    const href = await page
      .locator('a[href^="/studio/casting/"], [data-casting-href]')
      .first()
      .getAttribute('href')
      .catch(() => null)
    const id = href?.split('/studio/casting/')[1]?.split('/')[0]
    if (id) scoped.push(`/studio/casting/${id}`, `/studio/casting/${id}/console`)
  }

  for (const route of [...routes, ...scoped]) {
    await page.goto(`http://localhost:5180${route}`)
    await page.waitForTimeout(1600)
    const squares = await probe(page)
    if (squares.length) {
      console.log(`\n${label} ${route}`)
      for (const square of squares) console.log(`   ${square}`)
    }
  }
  await context.close()
}
await browser.close()
console.log('\nradius audit done')
