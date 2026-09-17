import { chromium } from '@playwright/test'

const WIDTHS = [1536, 1280, 1024, 768, 430, 375]

const TALENT = ['/talent', '/talent/casting-calls', '/talent/auditions', '/talent/messages', '/talent/notifications', '/talent/profile']
const STUDIO = ['/studio', '/studio/casting-calls', '/studio/casting-calls/new', '/studio/projects', '/studio/talent', '/studio/calendar', '/studio/team', '/studio/settings', '/studio/messages', '/studio/notifications']
const PUBLIC = ['/', '/auth/sign-in', '/auth/sign-up', '/auth/forgot-password']

async function signIn(page, email) {
  await page.goto('http://localhost:5180/auth/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('LetItCast2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/(talent|studio)/, { timeout: 30000 })
}

/**
 * Measures what actually makes a layout feel broken, and ignores what is
 * deliberate: truncated text, and children of a scroll container.
 */
async function probe(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out = { overflow: 0, wide: [], small: [], scrollers: [] }

    out.overflow = Math.max(0, document.documentElement.scrollWidth - vw)

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue

      const inScroller = el.closest('.no-scrollbar, [data-scroller], .overflow-x-auto')
      // Decorative layers (brand blobs, glows) are meant to bleed out of their box.
      const decorative = el.closest('[aria-hidden="true"], .pointer-events-none')

      // Sticking out of the viewport
      if (r.right > vw + 2 && r.width > 40 && !inScroller && !decorative) {
        const wideCls = (el.className || '').toString().slice(0, 48)
        out.wide.push(`${el.tagName.toLowerCase()}.${wideCls} w=${Math.round(r.width)} right=${Math.round(r.right)}`)
      }

      // Tap targets
      if (['BUTTON', 'A'].includes(el.tagName) && el.textContent?.trim()) {
        // 32px is the floor for a comfortable tap target.
        if (r.height < 32 && r.width > 8 && !el.closest('table')) {
          out.small.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}" h=${Math.round(r.height)}`)
        }
      }

      // Content clipped with nowhere to go (truncation is deliberate)
      const cls = (el.className || '').toString()
      const truncates = cls.includes('truncate') || cls.includes('line-clamp')
      if (
        el.scrollWidth > el.clientWidth + 4 &&
        el.clientWidth > 120 &&
        !truncates &&
        !inScroller &&
        !decorative
      ) {
        const style = getComputedStyle(el)
        if (style.overflowX === 'visible' || style.overflowX === 'hidden') {
          out.scrollers.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`)
        }
      }
    }
    out.wide = [...new Set(out.wide)].slice(0, 4)
    out.small = [...new Set(out.small)].slice(0, 4)
    out.scrollers = [...new Set(out.scrollers)].slice(0, 3)
    return out
  })
}

const browser = await chromium.launch()

for (const [label, email, routes] of [
  ['public', null, PUBLIC],
  ['talent', 'maya@letitcast.demo', TALENT],
  ['studio', 'peter@letitcast.demo', STUDIO],
]) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    if (email) await signIn(page, email)
    for (const route of routes) {
      await page.goto('http://localhost:5180' + route)
      await page.waitForTimeout(1100)
      const result = await probe(page)
      const issues = []
      if (result.overflow > 2) issues.push(`overflow +${result.overflow}`)
      if (result.wide.length) issues.push(`wide: ${result.wide.join(' | ')}`)
      if (result.small.length) issues.push(`small targets: ${result.small.join(' | ')}`)
      if (result.scrollers.length) issues.push(`clipped: ${result.scrollers.join(' | ')}`)
      if (issues.length) console.log(`${String(width).padEnd(5)} ${route.padEnd(28)} ${issues.join('  ·  ')}`)
    }
    await page.close()
  }
}

await browser.close()
console.log('audit done')
