/**
 * What the platform has tried to send, and what happened to it.
 *
 *   node scripts/email-status.mjs           — the last 20 emails
 *   node scripts/email-status.mjs --pending — only what has not been sent
 *
 * `skipped` means no provider is configured: the content is kept, nothing left
 * the database. See docs/DATABASE.md to switch it on.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const onlyPending = process.argv.includes('--pending')

let query = admin
  .from('email_outbox')
  .select('to_email, subject, kind, status, detail, created_at, sent_at')
  .order('created_at', { ascending: false })
  .limit(20)

if (onlyPending) query = query.in('status', ['pending', 'dispatched', 'skipped', 'failed'])

const { data, error } = await query
if (error) {
  console.error('Could not read the outbox:', error.message)
  process.exit(1)
}

const counts = new Map()
for (const row of data ?? []) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)

console.log(
  `\n${data?.length ?? 0} email(s) · ` +
    ([...counts].map(([status, count]) => `${status}: ${count}`).join(' · ') || 'nothing yet'),
)

for (const row of data ?? []) {
  const when = new Date(row.created_at).toLocaleString()
  console.log(`\n${row.status.toUpperCase().padEnd(10)} ${when}`)
  console.log(`  → ${row.to_email}  [${row.kind}]`)
  console.log(`  ${row.subject}`)
  if (row.detail) console.log(`  ${row.detail.slice(0, 160)}`)
}

console.log('')
