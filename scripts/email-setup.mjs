/**
 * Turns the outbound email on, with an SMTP server you already own.
 *
 *   SMTP_HOST=smtp.mail.me.com SMTP_PORT=587 \
 *   SMTP_USER=you@icloud.com SMTP_PASS=app-specific-password \
 *   EMAIL_FROM='Let It Cast <you@icloud.com>' \
 *   node scripts/email-setup.mjs
 *
 * It does three things:
 *   1. stores the SMTP credentials as Edge Function secrets (never in the repo,
 *      never in the database),
 *   2. points the database's sender at the `send-email` function,
 *   3. sets the same SMTP for Supabase Auth, so confirmation and password-reset
 *      emails stop being capped at 2 per hour by the shared mailer.
 *
 * Nothing here prints a password.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

const TOKEN = readFileSync(`${process.env.HOME}/.supabase-token`, 'utf8').trim()
const REF = env.VITE_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
const API = `https://api.supabase.com/v1/projects/${REF}`

const host = process.env.SMTP_HOST
const port = process.env.SMTP_PORT ?? '587'
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const from = process.env.EMAIL_FROM ?? `Let It Cast <${user}>`

if (!host || !user || !pass) {
  console.error(
    'Missing SMTP_HOST, SMTP_USER or SMTP_PASS.\n' +
      'Use an app-specific password (iCloud, Gmail) or your company relay.',
  )
  process.exit(1)
}

const hook = randomBytes(24).toString('hex')

async function api(path, body, method = 'POST') {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  return response.status
}

// 1. The function's own secrets.
await api('/secrets', [
  { name: 'SMTP_HOST', value: host },
  { name: 'SMTP_PORT', value: String(port) },
  { name: 'SMTP_USER', value: user },
  { name: 'SMTP_PASS', value: pass },
  { name: 'EMAIL_HOOK_SECRET', value: hook },
])
console.log('✓ Edge Function secrets set')

// 2. The database sender points at the function, with the shared secret.
const sql = `
  select vault.update_secret(id, '${env.VITE_SUPABASE_URL}/functions/v1/send-email')
    from vault.secrets where name = 'email_provider_url';
  select vault.update_secret(id, '${hook}') from vault.secrets where name = 'email_api_key';
  select vault.update_secret(id, ${JSON.stringify(from).replace(/'/g, "''")}) from vault.secrets where name = 'email_from';
`
execFileSync('node', ['scripts/db.mjs', 'query', sql], { stdio: 'inherit' })
console.log('✓ database sender wired to the function')

// 3. Auth emails through the same server.
await api(
  '/config/auth',
  {
    smtp_host: host,
    smtp_port: Number(port),
    smtp_user: user,
    smtp_pass: pass,
    smtp_admin_email: user,
    smtp_sender_name: 'Let It Cast',
    rate_limit_email_sent: 100,
  },
  'PATCH',
)
console.log('✓ Supabase Auth now uses the same SMTP (rate limit lifted to 100/h)')

console.log('\nSend a message in the app, then: npm run email:status')
