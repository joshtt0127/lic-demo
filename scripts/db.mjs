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
 *   node scripts/db.mjs check                rehearse pending migrations, keep nothing
 *   node scripts/db.mjs residue              what tests and demos left behind (read-only)
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

/**
 * L'historique vit dans un schéma **non exposé** par l'API.
 *
 * Il était dans `public`, donc lisible par quiconque avait la clé publique —
 * la liste des fichiers de migration, c'est la carte du schéma offerte à qui
 * passe (alerte « critical » de Supabase, corrigée par 20260922150000).
 */
const MIGRATION_TABLE = `
  create schema if not exists private;
  revoke all on schema private from anon, authenticated;

  create table if not exists private.schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  );

  -- Déménagement de l'historique **avec ses lignes** : la table a d'abord vécu
  -- dans \`public\`, donc dans l'API. Idempotent, quel que soit l'état.
  do $$
  begin
    if exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'schema_migrations'
    ) then
      insert into private.schema_migrations (name, applied_at)
      select name, applied_at from public.schema_migrations
      on conflict (name) do nothing;
      drop table public.schema_migrations;
    end if;
  end
  $$;
  alter table private.schema_migrations enable row level security;
  revoke all on private.schema_migrations from anon, authenticated;
`

function migrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return []
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

async function appliedMigrations() {
  await sql(MIGRATION_TABLE)
  const rows = await sql('select name from private.schema_migrations order by name;')
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
    await sql(`begin;\n${body}\ninsert into private.schema_migrations (name) values ('${file}');\ncommit;`)
    console.log('ok')
  }
  console.log('✓ Done.')
}

/**
 * Répéter une migration sans la garder.
 *
 * Il n'y a qu'une seule base : le développement et la production partagent le
 * même Postgres, et c'est une décision assumée. La conséquence l'est moins —
 * une migration part directement en production, sans répétition, et une erreur
 * de SQL se découvre sur les données réelles.
 *
 * `check` joue donc les migrations en attente **dans une transaction qu'on
 * annule**. Postgres exécute tout pour de vrai — contraintes, triggers, index,
 * vues, types — puis rend la base exactement dans l'état où on l'a trouvée.
 * C'est la répétition qu'un second projet offrirait, sans second projet.
 *
 * Ce qu'elle ne couvre pas, et il faut le savoir : une migration qui réussit
 * mais fait la mauvaise chose. Elle attrape la syntaxe, les types, les
 * contraintes violées par les données existantes — pas une erreur de jugement.
 */
async function check() {
  const applied = await appliedMigrations()
  const pending = migrationFiles().filter((f) => !applied.has(f))
  if (pending.length === 0) {
    console.log('✓ Nothing pending — nothing to rehearse.')
    return
  }

  console.log(`Rehearsing ${pending.length} migration(s) against ${projectRef()} (nothing is kept)…`)
  // Toutes dans une seule transaction : c'est ainsi qu'elles s'appliqueront les
  // unes après les autres, et une migration peut dépendre de la précédente.
  const body = pending
    .map((file) => readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    .join('\n')

  try {
    await sql(`begin;\n${body}\nrollback;`)
    for (const file of pending) console.log(`  · ${file} … ok`)
    console.log('✓ All pending migrations run cleanly. Nothing was kept — run `push` to apply.')
  } catch (error) {
    console.error('\n✖ A pending migration would fail. Nothing was applied.')
    console.error(String(error.message ?? error))
    process.exitCode = 1
  }
}

/**
 * Ce que les tests et les démonstrations laissent dans la base de production.
 *
 * Il n'y a qu'une base, par choix. La contrepartie est qu'une suite E2E, un
 * script de démonstration ou un test qui échoue avant son nettoyage déposent
 * leurs restes **là où vivent les vraies données**. Ces restes ne gênent
 * personne tant qu'on les voit ; le jour où on ne les compte plus, on ne sait
 * plus distinguer un compte de test d'un vrai client, et c'est à ce
 * moment-là qu'on supprime la mauvaise ligne.
 *
 * Lecture seule, volontairement. Ce rapport ne nettoie rien : il dit ce qu'il y
 * a, et laisse la suppression à des outils qui savent ce qu'ils suppriment
 * (`storage-gc.mjs`, le teardown des tests, `seed-intelligence-demo --clean`).
 */
async function residue() {
  const rows = await sql(`
    select 'comptes E2E'            as quoi, count(*) as combien from auth.users where email like 'e2e.%@letitcast.dev'
    union all
    select 'comptes de démo',       count(*) from auth.users where email like 'demo.il.%'
    union all
    select 'organisations sans membre actif', count(*) from public.organizations o
      where not exists (select 1 from public.organization_members m where m.org_id = o.id and m.status = 'active')
    union all
    select 'événements sans entité vivante', count(*) from public.events e
      where e.entity_type = 'application'
        and not exists (select 1 from public.applications a where a.id = e.entity_id)
    union all
    select 'fichiers sans ligne media_assets', count(*) from storage.objects o
      where not exists (select 1 from public.media_assets m where m.bucket = o.bucket_id and m.path = o.name)
    order by 1;
  `)

  console.log(`\nRésidus dans ${projectRef()} — lecture seule, rien n'est supprimé :\n`)
  let total = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const count = Number(row.combien)
    total += count
    console.log(`  ${String(count).padStart(5)}  ${row.quoi}`)
  }
  console.log(
    total === 0
      ? '\n✓ Rien à signaler.'
      : "\nPour nettoyer : `node scripts/storage-gc.mjs --delete` (fichiers) · " +
        '`node scripts/seed-intelligence-demo.mjs <org> --clean` (démo) · le teardown E2E (comptes).',
  )
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
  case 'residue':
    await residue()
    break
  case 'check':
    await check()
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
