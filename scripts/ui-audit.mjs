/**
 * Static checks on the mounted UI.
 *
 *  1. Dead controls — a <button> with no onClick and no type="submit",
 *     an <a>/<Link> pointing nowhere, a handler that does nothing.
 *  2. Screens that read the server but never show an error — a failed query
 *     that leaves a blank card is the worst kind of silence.
 *
 * Only files reachable from the router are checked: the legacy fixture screens
 * are not mounted and are not the app.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const MOUNTED_DIRS = ['src/pages', 'src/talent', 'src/studio', 'src/features', 'src/components']
// Screens the router never mounts (kept as design references).
const UNMOUNTED = new Set([
  'src/studio/HomeFeed.tsx',
  'src/studio/Dashboard.tsx',
  'src/studio/CommandCenter.tsx',
  'src/studio/SelectionConsole.tsx',
  'src/studio/RoleReview.tsx',
  'src/studio/Review.tsx',
  'src/studio/Search.tsx',
  'src/studio/Wall.tsx',
  'src/studio/NewCasting.tsx',
  'src/studio/Projects.tsx',
  'src/studio/TalentProfile.tsx',
])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) out.push(path)
  }
  return out
}

const files = MOUNTED_DIRS.flatMap((dir) => walk(dir)).filter((file) => !UNMOUNTED.has(file))

const dead = []
const silent = []

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')

  // ── 1. Controls that go nowhere ──
  const opens = [...source.matchAll(/<(button|Button|a|Link|NavLink)[\s>]/g)]
  for (const match of opens) {
    const start = match.index
    // The opening tag, up to the first '>' that is not inside braces.
    let depth = 0
    let end = start
    for (; end < source.length; end += 1) {
      const char = source[end]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      else if (char === '>' && depth === 0) break
    }
    const tag = source.slice(start, end)
    const name = match[1]
    const hasAction =
      /\bonClick=/.test(tag) ||
      /\btype="submit"/.test(tag) ||
      /\bto=/.test(tag) ||
      /\bhref=/.test(tag) ||
      /\bonChange=/.test(tag) ||
      /\bdisabled\b/.test(tag) ||
      /\{\.\.\./.test(tag) ||
      /\basChild\b/.test(tag)
    if (!hasAction) {
      const line = source.slice(0, start).split('\n').length
      dead.push(`${file}:${line}  <${name}> with no onClick / to / href / submit`)
    }
    if (/\bto=""|href=""|href="#"/.test(tag)) {
      const line = source.slice(0, start).split('\n').length
      dead.push(`${file}:${line}  <${name}> pointing at nothing`)
    }
  }

  // Handlers that do nothing at all.
  lines.forEach((line, index) => {
    if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(line) || /onClick=\{undefined\}/.test(line)) {
      dead.push(`${file}:${index + 1}  empty onClick`)
    }
  })

  // ── 2. Server data without an error path ──
  // App shells only read badge counts: a failed count shows no badge, which is
  // the honest fallback — it does not deserve an error banner.
  const isShell = /Layout\.tsx$/.test(file)
  const readsServer = /use[A-Z]\w*\((?!\)).*\)/.test(source) && /\.data\b/.test(source)
  const showsError = /\.error\b/.test(source) || /errorMessage\(/.test(source) || /FormError/.test(source)
  const isScreen = /\/(pages|talent|studio)\//.test(file) && /export function [A-Z]/.test(source)
  if (readsServer && isScreen && !isShell && !showsError) {
    silent.push(`${file}  reads server data but never shows an error`)
  }

  // ── 3. Lists that render nothing when there is nothing ──
  // Only lists built from server data — mapping a static option list is not a
  // screen state.
  const rendersList =
    /\.data\b/.test(source) &&
    /\.data[^\n]{0,40}\.map\(|\.data \?\? \[\]\)\.map\(|\b(rows|items|results)\.map\(/.test(source)
  const hasEmptyState = /EmptyState|No \w+ yet|Nothing |length === 0/.test(source)
  const hasLoading = /isLoading|isPending|Skeleton|Spinner|\bpending\b/.test(source)
  if (isScreen && !isShell && rendersList && !hasEmptyState) {
    silent.push(`${file}  renders a list with no empty state`)
  }
  if (isScreen && !isShell && readsServer && !hasLoading) {
    silent.push(`${file}  reads server data with no loading state`)
  }
}

for (const entry of dead) console.log(`dead   ${entry}`)
for (const entry of silent) console.log(`silent ${entry}`)
console.log(`\n${files.length} mounted files · ${dead.length} dead control(s) · ${silent.length} silent screen(s)`)
