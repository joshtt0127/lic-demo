#!/usr/bin/env node
/**
 * Déploie une Edge Function par la Management API — pas de CLI supabase ni de
 * Docker sur les postes (même raison que scripts/db.mjs).
 *
 *   node scripts/deploy-function.mjs extract-brief
 *
 * Mêmes identifiants que db.mjs : SUPABASE_ACCESS_TOKEN (env, .env.local ou
 * ~/.supabase-token) et SUPABASE_PROJECT_REF. Les secrets de la fonction
 * (GEMINI_API_KEY…) sont partagés par toutes les fonctions du projet.
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const slug = process.argv[2]
if (!slug) fail('Usage: node scripts/deploy-function.mjs <name>')

function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const fileEnv = { ...loadEnvFile(path.join(ROOT, '.env')), ...loadEnvFile(path.join(ROOT, '.env.local')) }
const env = (name) => process.env[name] || fileEnv[name] || ''

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const tokenFile = path.join(homedir(), '.supabase-token')
const token = env('SUPABASE_ACCESS_TOKEN') || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '')
const ref = env('SUPABASE_PROJECT_REF')
if (!token) fail('No Supabase access token (see scripts/db.mjs).')
if (!ref) fail('No SUPABASE_PROJECT_REF.')

const entry = path.join(ROOT, 'supabase', 'functions', slug, 'index.ts')
if (!existsSync(entry)) fail(`No ${path.relative(ROOT, entry)}`)

const form = new FormData()
form.append('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.ts', verify_jwt: true }))
form.append('file', new Blob([readFileSync(entry)], { type: 'application/typescript' }), 'index.ts')

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
  { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
)
const text = await res.text()
if (!res.ok) fail(`deploy ${slug} → ${res.status}\n${text}`)
const payload = JSON.parse(text)
console.log(`✔ ${slug} deployed — version ${payload.version ?? '?'} (${payload.status ?? 'ok'})`)
