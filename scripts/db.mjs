#!/usr/bin/env node
/**
 * Let It Cast — database CLI.
 *
 * There is no Docker on the dev machines, so no local Supabase stack: this
 * script talks to the Supabase Management API instead of the `supabase` CLI.
 *
 *   node scripts/db.mjs orgs                 list the organizations of the token
 *   node scripts/db.mjs create-project [name]create the project + print the keys
 *   node scripts/db.mjs status               show which migrations are applied
 *   node scripts/db.mjs push                 apply every pending migration
 *   node scripts/db.mjs configure-auth       POC auth settings (no email confirmation)
 *   node scripts/db.mjs types                write src/types/database.generated.ts
 *   node scripts/db.mjs query "select 1"     run ad-hoc SQL
 *
 * Credentials, in order of precedence:
 *   SUPABASE_ACCESS_TOKEN env var → .env / .env.local → ~/.supabase-token
 *   SUPABASE_PROJECT_REF   env var → .env / .env.local
 *
 * Behind a TLS-intercepting corporate proxy, run with NODE_OPTIONS=--use-system-ca
 * (already wired into the npm scripts).
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')
const API = 'https://api.supabase.com'

// ── Config ───────────────────────────────────────────────────────────────────

/** Minimal .env parser — avoids a dependency for four variables. */
function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    out[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = { ...loadEnvFile(path.join(ROOT, '.env')), ...loadEnvFile(path.join(ROOT, '.env.local')) }

function env(name) {
  return process.env[name] || fileEnv[name] || ''
}

function accessToken() {
  const fromEnv = env('SUPABASE_ACCESS_TOKEN')
  if (fromEnv) return fromEnv.trim()
  const tokenFile = path.join(homedir(), '.supabase-token')
  if (existsSync(tokenFile)) return readFileSync(tokenFile, 'utf8').trim()
  fail(
    'No Supabase access token.\n' +
      "  printf 'sbp_xxx' > ~/.supabase-token && chmod 600 ~/.supabase-token\n" +
      '  (or export SUPABASE_ACCESS_TOKEN)',
  )
}

function projectRef() {
  const ref = env('SUPABASE_PROJECT_REF')
  if (!ref) fail('No SUPABASE_PROJECT_REF — add it to .env.local (or run `create-project` first).')
  return ref
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

// ── Management API ───────────────────────────────────────────────────────────

async function api(route, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let payload = text
  try {
    payload = text ? JSON.parse(text) : ''
  } catch {
    // non-JSON body (error pages) — keep the raw text
  }
  if (!res.ok) {
    fail(`${method} ${route} → ${res.status}\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}`)
  }
  return payload
}

/** Run SQL on the project database (service-role level, server side). */
async function sql(query) {
  return api(`/v1/projects/${projectRef()}/database/query`, { method: 'POST', body: { query } })
}

// ── Migrations ───────────────────────────────────────────────────────────────

const MIGRATION_TABLE = `
  create table if not exists public.schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  );
`

function migrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return []
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

async function appliedMigrations() {
  await sql(MIGRATION_TABLE)
  const rows = await sql('select name from public.schema_migrations order by name;')
  return new Set((Array.isArray(rows) ? rows : []).map((r) => r.name))
}

async function push() {
  const applied = await appliedMigrations()
  const pending = migrationFiles().filter((f) => !applied.has(f))
  if (pending.length === 0) {
    console.log('✓ Database up to date — nothing to apply.')
    return
  }
  console.log(`Applying ${pending.length} migration(s) to ${projectRef()}…`)
  for (const file of pending) {
    const body = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    process.stdout.write(`  · ${file} … `)
    // One transaction per migration: a failing file leaves no partial schema.
    await sql(`begin;\n${body}\ninsert into public.schema_migrations (name) values ('${file}');\ncommit;`)
    console.log('ok')
  }
  console.log('✓ Done.')
}

async function status() {
  const applied = await appliedMigrations()
  for (const file of migrationFiles()) {
    console.log(`${applied.has(file) ? '✓' : '·'} ${file}`)
  }
}

// ── Project bootstrap ────────────────────────────────────────────────────────

async function orgs() {
  const list = await api('/v1/organizations')
  for (const o of list) console.log(`${o.id}\t${o.name}`)
  if (list.length === 0) console.log('(no organization on this account)')
}

function randomPassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 28; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

async function createProject(name = 'let-it-cast-poc') {
  const list = await api('/v1/organizations')
  if (list.length === 0) fail('This token has no organization — create one on supabase.com first.')
  const org = list[0]
  const dbPass = randomPassword()
  const region = env('SUPABASE_REGION') || 'eu-west-3'

  console.log(`Creating project "${name}" in org "${org.name}" (${region})…`)
  const project = await api('/v1/projects', {
    method: 'POST',
    body: { name, organization_id: org.id, region, db_pass: dbPass },
  })

  console.log(`  ref: ${project.id}`)
  process.stdout.write('  waiting for the project to come up')
  let info = project
  for (let i = 0; i < 60; i += 1) {
    if (info.status === 'ACTIVE_HEALTHY') break
    await new Promise((r) => setTimeout(r, 5000))
    process.stdout.write('.')
    info = await api(`/v1/projects/${project.id}`)
  }
  console.log(info.status === 'ACTIVE_HEALTHY' ? ' up' : ` still ${info.status}`)

  const keys = await api(`/v1/projects/${project.id}/api-keys?reveal=true`)
  const anon = keys.find((k) => k.name === 'anon')?.api_key ?? ''
  const service = keys.find((k) => k.name === 'service_role')?.api_key ?? ''

  console.log('\nAdd this to .env.local (git-ignored):\n')
  console.log(`VITE_SUPABASE_URL=https://${project.id}.supabase.co`)
  console.log(`VITE_SUPABASE_ANON_KEY=${anon}`)
  console.log(`SUPABASE_PROJECT_REF=${project.id}`)
  console.log(`SUPABASE_SERVICE_ROLE_KEY=${service}`)
  console.log(`# database password (keep it somewhere safe): ${dbPass}\n`)
}

/**
 * POC auth settings: sign-up must land straight in the onboarding, so email
 * confirmation is off and the local dev origin is allowed to receive redirects
 * (password reset).
 */
async function configureAuth() {
  const siteUrl = env('SITE_URL') || 'http://localhost:5174'
  await api(`/v1/projects/${projectRef()}/config/auth`, {
    method: 'PATCH',
    body: {
      mailer_autoconfirm: true,
      site_url: siteUrl,
      uri_allow_list: [
        `${siteUrl}/**`,
        'http://localhost:5173/**',
        'http://localhost:5174/**',
        'http://localhost:4173/**',
      ].join(','),
      password_min_length: 8,
    },
  })
  console.log(`✓ Auth configured (no email confirmation, site_url ${siteUrl})`)
}

// ── Types ────────────────────────────────────────────────────────────────────

async function types() {
  const out = await api(`/v1/projects/${projectRef()}/types/typescript?included_schemas=public`)
  const target = path.join(ROOT, 'src', 'types', 'database.generated.ts')
  writeFileSync(target, typeof out === 'string' ? out : out.types)
  console.log(`✓ Wrote ${path.relative(ROOT, target)}`)
}

// ── Entry point ──────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2)

switch (command) {
  case 'orgs':
    await orgs()
    break
  case 'create-project':
    await createProject(rest[0])
    break
  case 'configure-auth':
    await configureAuth()
    break
  case 'status':
    await status()
    break
  case 'push':
    await push()
    break
  case 'types':
    await types()
    break
  case 'query': {
    if (!rest[0]) fail('Usage: node scripts/db.mjs query "select 1"')
    console.log(JSON.stringify(await sql(rest.join(' ')), null, 2))
    break
  }
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 22).join('\n'))
}
