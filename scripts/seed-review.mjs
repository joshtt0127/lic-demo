#!/usr/bin/env node
/**
 * Let It Cast — Audition Review Queue™ demo.
 *
 * Fills Peter's organization with a casting worth reviewing:
 *
 *   MasterChef Australia — Season 17   open, two roles, 28 real self-tapes
 *   Big Brother Australia — Season 16  closed months ago, its decisions are the memory
 *
 * Three talents were noticed on Big Brother (good votes, a positive label) and
 * finally passed. They apply to MasterChef: the Intelligence Feed™ brings them
 * up with the reason. First-time applicants with a complete dossier fill the
 * Discovery lane. Four producers have voted, labelled and assigned — their
 * votes stay their own.
 *
 *   npm run db:seed:review
 *
 * Idempotent: running it again resets the review state of these two castings
 * (votes, labels, assignments, attention) to the same starting point.
 * Requires `npm run db:seed` first (Peter and the A24 organization).
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
)
const PASSWORD = env.DEMO_PASSWORD || 'LetItCast2026!'
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✖ .env.local needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HOUR = 3600000
const DAY = 24 * HOUR
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' }

function die(label, error) {
  if (!error) return
  console.error(`✖ ${label}: ${error.message ?? JSON.stringify(error)}`)
  process.exit(1)
}

async function uploadAsset(ownerId, kind, publicPath) {
  const absolute = path.join(ROOT, 'public', publicPath.replace(/^\//, ''))
  if (!existsSync(absolute)) die(`missing asset ${publicPath}`, { message: 'not found' })
  const extension = path.extname(absolute).toLowerCase()
  const bucket = kind === 'selftape' ? 'selftapes' : kind === 'avatar' ? 'avatars' : 'media'
  const objectPath = `${ownerId}/${kind}-${path.basename(absolute).replace(/[^a-zA-Z0-9.-]/g, '-')}`
  const body = readFileSync(absolute)
  const { error: uploadError } = await db.storage
    .from(bucket)
    .upload(objectPath, body, { contentType: MIME[extension], upsert: true })
  die(`upload ${publicPath}`, uploadError)
  const { data, error } = await db
    .from('media_assets')
    .upsert(
      { owner_id: ownerId, kind, bucket, path: objectPath, mime: MIME[extension], bytes: body.byteLength },
      { onConflict: 'bucket,path' },
    )
    .select('*')
    .single()
  die(`media_assets ${publicPath}`, error)
  return { ...data, url: bucket === 'selftapes' ? null : db.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl }
}

let usersCache = null
async function findUser(email) {
  if (!usersCache) {
    usersCache = []
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      die('listUsers', error)
      usersCache.push(...data.users)
      if (data.users.length < 200) break
    }
  }
  return usersCache.find((user) => user.email === email) ?? null
}

async function ensureUser({ email, firstName, lastName, accountType, city, country }) {
  let user = await findUser(email)
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, account_type: accountType },
    })
    die(`createUser ${email}`, error)
    user = data.user
  }
  die(
    `profile ${email}`,
    (await db
      .from('profiles')
      .update({
        account_type: accountType,
        first_name: firstName,
        last_name: lastName,
        city,
        country,
        onboarding_step: null,
        onboarding_completed_at: new Date().toISOString(),
        adult_confirmed_at: new Date().toISOString(),
        // Demo addresses do not exist: nothing should leave by e-mail for them.
        email_notifications: false,
      })
      .eq('id', user.id)).error,
  )
  return user
}

const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')

// ── The team ────────────────────────────────────────────────────────────────

const TEAM = [
  { key: 'lara', firstName: 'Lara', lastName: 'Khan', role: 'casting_director', title: 'Casting director', avatar: '/avatars/lara-khan.jpg' },
  { key: 'eden', firstName: 'Eden', lastName: 'Tov', role: 'member', title: 'Producer', avatar: '/avatars/eden-tov.jpg' },
  { key: 'julie', firstName: 'Julie', lastName: 'Cohen', role: 'member', title: 'Story producer', avatar: '/avatars/julie-cohen.jpg' },
]

// ── The talents (real self-tapes from public/casting-nonscripted) ──────────
//
// band: what the demo expects the feed to do with them — checked at the end.

const HOME = 'Home cooks'
const MENTOR = 'Guest mentors'

const NOTE = {
  family: 'I cook for my family every night and I want to bring that story, my personality and my flavours into the MasterChef kitchen.',
  heritage: 'My grandmother taught me to cook. Every dish tells a story about family, and I want to show that personality on camera in the kitchen.',
  bold: 'I am loud, I am messy, and I cook with big flavours. Put me in that kitchen and the camera will never be bored with my story.',
  mentor: 'Thirty years cooking for my family and my restaurant regulars. I would love to share that story in the kitchen as a mentor on camera.',
}

const PEOPLE = [
  // Remarqués puis écartés sur Big Brother : la mémoire les fait remonter.
  { name: 'Layla Hassan', age: 38, city: 'Houston', gender: 'Female', langs: ['en', 'ar'], role: HOME, hours: 30, note: NOTE.heritage, memory: { votes: { lara: 'good', eden: 'good', julie: 'maybe' }, label: 'Big personality', comment: 'Lit up every room in the house tour. Wrong season for her, not the wrong person.' }, band: 'priority' },
  { name: 'Kevin Moreau', age: 46, city: 'Boston', gender: 'Male', langs: ['en', 'fr'], role: HOME, hours: 20, note: NOTE.family, memory: { votes: { eden: 'good', peter: 'maybe' }, label: 'Strong on camera', comment: 'Natural storyteller. We passed for casting balance, not for him.' }, band: 'priority' },
  { name: 'Tom Bradley', age: 26, city: 'Nashville', gender: 'Male', langs: ['en'], role: HOME, hours: 44, note: NOTE.bold, memory: { votes: { julie: 'good' } }, band: 'priority' },
  // Écarté sur Big Brother sans aucun signal : aucune remontée (le contrôle).
  { name: 'Ryan O’Brien', file: 'ryan-obrien', age: 30, city: 'Seattle', gender: 'Male', langs: ['en'], role: HOME, hours: 26, pastPlain: true, opened: 'lara', band: 'all' },
  // Casté avec nous sur Big Brother.
  { name: 'Marcus Rivera', age: 42, city: 'Perth', gender: 'Male', langs: ['en', 'es'], role: MENTOR, hours: 50, note: NOTE.mentor, pastCast: true, band: 'priority' },

  // L'équipe a déjà voté : la décision attend.
  { name: 'Sophie Bergmann', age: 31, city: 'Melbourne', gender: 'Female', langs: ['en', 'de'], role: HOME, hours: 60, note: NOTE.heritage, votes: { eden: ['good', 'Incredible presence, completely natural on camera.'], julie: ['good', 'Her story about her father’s bakery is the episode.'], lara: ['maybe', 'Love her — need to see her under pressure.'] }, labels: ['Strong on camera'], seen: true, assign: 'peter', band: 'priority' },
  { name: 'Omar Khalil', age: 28, city: 'Los Angeles', gender: 'Male', langs: ['en', 'ar'], role: HOME, hours: 54, note: NOTE.bold, votes: { lara: ['good', 'Great energy. Callback.'], eden: ['maybe', 'Fun, but the cooking felt rehearsed.'] }, labels: ['Big personality'], seen: true, band: 'priority' },
  { name: 'Priya Suresh', age: 35, city: 'Brisbane', gender: 'Female', langs: ['en', 'ta'], role: HOME, hours: 40, note: NOTE.family, votes: { julie: ['good', 'Original food, warm and funny.'], lara: ['no', 'Not sure she holds the screen yet.'] }, band: 'priority' },
  { name: 'Francesca Conte', age: 30, city: 'Sydney', gender: 'Female', langs: ['en', 'it'], role: HOME, hours: 36, note: NOTE.heritage, votes: { peter: ['good', 'Yes.'], eden: ['good', 'Pasta from scratch in two minutes, talking the whole time.'] }, seen: true, band: 'priority' },
  { name: 'Jake Thornton', age: 33, city: 'Adelaide', gender: 'Male', langs: ['en'], role: HOME, hours: 32, note: NOTE.bold, votes: { lara: ['maybe', 'Second tape please, the first one is too short.'] }, seen: true, band: 'priority' },

  // Déjà décidés.
  { name: 'Amara Osei', age: 38, city: 'Sydney', gender: 'Female', langs: ['en'], role: HOME, hours: 66, note: NOTE.heritage, votes: { peter: ['good', 'Our opening episode.'], eden: ['good', 'Yes.'], julie: ['good', 'Yes yes yes.'] }, labels: ['Callback'], status: 'shortlisted', seen: true, band: 'priority' },
  { name: 'Lily Nakamura', age: 26, city: 'Melbourne', gender: 'Female', langs: ['en', 'ja'], role: HOME, hours: 62, note: NOTE.family, votes: { peter: ['good', null], lara: ['good', 'Precise and funny.'] }, status: 'shortlisted', seen: true, band: 'priority' },
  { name: 'Pablo Herrera', age: 44, city: 'Dallas', gender: 'Male', langs: ['en', 'es'], role: MENTOR, hours: 58, note: NOTE.mentor, votes: { lara: ['no', 'Not a mentor energy.'], eden: ['no', null] }, labels: ['Not for this season'], status: 'not_selected', seen: true, band: 'all' },

  // En attente depuis trop longtemps : le feed le rappelle.
  { name: 'David Chen', age: 47, city: 'San Francisco', gender: 'Male', langs: ['en', 'zh'], role: MENTOR, hours: 5 * 24, note: NOTE.mentor, assign: 'peter', band: 'priority' },
  { name: 'Sophie Tremblay', age: 42, city: 'Chicago', gender: 'Female', langs: ['en', 'fr'], role: HOME, hours: 4 * 24 + 6, note: NOTE.family, band: 'priority' },

  // Premières candidatures, dossier complet : la voie Discovery.
  { name: 'James Okafor', age: 29, city: 'Los Angeles', gender: 'Male', langs: ['en'], role: HOME, hours: 6, note: NOTE.bold, first: true, assign: 'julie', band: 'discovery' },
  { name: 'Amelia Park', age: 33, city: 'New York', gender: 'Female', langs: ['en', 'ko'], role: HOME, hours: 9, note: NOTE.heritage, first: true, assign: 'julie', band: 'discovery' },
  { name: 'Mei Lin Zhou', age: 31, city: 'Los Angeles', gender: 'Female', langs: ['en', 'zh'], role: HOME, hours: 14, note: NOTE.family, first: true, band: 'discovery' },
  { name: 'Grace Osei', age: 36, city: 'Atlanta', gender: 'Female', langs: ['en'], role: HOME, hours: 17, note: NOTE.heritage, first: true, band: 'discovery' },
  { name: 'Nadia Johansson', age: 39, city: 'Minneapolis', gender: 'Female', langs: ['en', 'sv'], role: HOME, hours: 22, note: NOTE.family, first: true, band: 'discovery' },
  { name: 'Elias Karam', age: 32, city: 'Detroit', gender: 'Male', langs: ['en', 'ar'], role: HOME, hours: 28, note: NOTE.bold, first: true, band: 'discovery' },
  { name: 'Priya Nair', age: 28, city: 'Chicago', gender: 'Female', langs: ['en', 'ml'], role: HOME, hours: 34, note: NOTE.family, first: true, band: 'discovery' },
  { name: 'Rosa Pereira', age: 35, city: 'Miami', gender: 'Female', langs: ['en', 'pt'], role: HOME, hours: 38, note: NOTE.heritage, first: true, band: 'discovery' },
  { name: 'Angela Santos', age: 57, city: 'San Diego', gender: 'Female', langs: ['en', 'tl'], role: MENTOR, hours: 12, note: NOTE.mentor, first: true, band: 'discovery' },

  // Ouverts une fois par l'équipe, rien de plus : la file complète.
  { name: 'Marco Delgado', age: 55, city: 'Miami', gender: 'Male', langs: ['en', 'es'], role: MENTOR, hours: 46, opened: 'lara', band: 'all' },
  { name: 'Aaron Willis', age: 52, city: 'New Orleans', gender: 'Male', langs: ['en'], role: MENTOR, hours: 42, opened: 'eden', band: 'all' },
  { name: 'Maria Gonzalez', age: 49, city: 'Phoenix', gender: 'Female', langs: ['en', 'es'], role: MENTOR, hours: 24, opened: 'julie', band: 'all' },
  { name: 'Linda Mbeki', age: 43, city: 'Atlanta', gender: 'Female', langs: ['en'], role: HOME, hours: 16, opened: 'eden', band: 'all' },
]

const LABELS = [
  { name: 'Big personality', tone: 'gold' },
  { name: 'Strong on camera', tone: 'good' },
  { name: 'Callback', tone: 'link' },
  { name: 'Not for this season', tone: 'no' },
]

// ── Helpers for projects / castings / roles ─────────────────────────────────

async function ensureProject(orgId, createdBy, row, poster) {
  const { data: existing } = await db.from('projects').select('*').eq('org_id', orgId).eq('title', row.title).maybeSingle()
  let project = existing
  if (project) {
    die(`project ${row.title}`, (await db.from('projects').update(row).eq('id', project.id)).error)
  } else {
    const { data, error } = await db.from('projects').insert({ org_id: orgId, created_by: createdBy, ...row }).select('*').single()
    die(`project ${row.title}`, error)
    project = data
  }
  const asset = await uploadAsset(createdBy, 'poster', poster)
  await db.from('projects').update({ poster_url: asset.url }).eq('id', project.id)
  return project
}

async function ensureCasting(projectId, createdBy, row) {
  const { data: existing } = await db.from('casting_calls').select('*').eq('project_id', projectId).eq('title', row.title).maybeSingle()
  // Toujours publié pendant l'écriture des candidatures, refermé ensuite si besoin.
  const values = { ...row, status: 'published', published_at: row.published_at ?? new Date().toISOString() }
  if (existing) {
    die(`casting ${row.title}`, (await db.from('casting_calls').update(values).eq('id', existing.id)).error)
    return existing
  }
  const { data, error } = await db.from('casting_calls').insert({ project_id: projectId, created_by: createdBy, ...values }).select('*').single()
  die(`casting ${row.title}`, error)
  return data
}

async function ensureRole(castingId, row) {
  const { data: existing } = await db.from('roles').select('*').eq('casting_call_id', castingId).eq('name', row.name).maybeSingle()
  if (existing) {
    die(`role ${row.name}`, (await db.from('roles').update(row).eq('id', existing.id)).error)
    return existing.id
  }
  const { data, error } = await db.from('roles').insert({ casting_call_id: castingId, ...row }).select('id').single()
  die(`role ${row.name}`, error)
  return data.id
}

async function ensureApplication({ roleId, talentId, submittedAt, note, headshotId }) {
  const { data, error } = await db
    .from('applications')
    .upsert(
      { role_id: roleId, talent_id: talentId, status: 'submitted', submitted_at: submittedAt, note: note ?? null, headshot_id: headshotId ?? null, source: 'seed', viewed_at: null, decided_at: null },
      { onConflict: 'role_id,talent_id' },
    )
    .select('*')
    .single()
  die('application', error)
  return data
}

async function setStatus(applicationId, status, decidedAt) {
  if (status === 'submitted') return
  die(
    `status ${status}`,
    (await db.from('applications').update({ status, decided_at: decidedAt ?? new Date().toISOString() }).eq('id', applicationId)).error,
  )
}

// ── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  const startedAt = new Date().toISOString()
  const peterUser = await findUser('peter@letitcast.demo')
  if (!peterUser) die('peter', { message: 'run `npm run db:seed` first' })
  const { data: org } = await db.from('organizations').select('*').eq('slug', 'a24-demo').single()
  if (!org) die('org', { message: 'run `npm run db:seed` first' })
  const team = { peter: peterUser.id }

  // L'équipe : quatre producteurs qui revoient ensemble.
  for (const member of TEAM) {
    const user = await ensureUser({
      email: `${member.key}@letitcast.demo`,
      firstName: member.firstName,
      lastName: member.lastName,
      accountType: 'production',
      city: 'Los Angeles',
      country: 'US',
    })
    team[member.key] = user.id
    await db.from('production_profiles').upsert({ profile_id: user.id, job_title: member.title }, { onConflict: 'profile_id' })
    const avatar = await uploadAsset(user.id, 'avatar', member.avatar)
    await db.from('profiles').update({ avatar_url: avatar.url }).eq('id', user.id)
    die(
      `member ${member.key}`,
      (await db
        .from('organization_members')
        .upsert({ org_id: org.id, profile_id: user.id, role: member.role, status: 'active' }, { onConflict: 'org_id,profile_id' })).error,
    )
  }
  console.log('✓ team                Peter, Lara, Eden, Julie')

  // Les talents.
  const { data: cooking } = await db.from('skills').select('id').eq('name', 'Cooking').single()
  const talents = {}
  for (const person of PEOPLE) {
    const [firstName, ...rest] = person.name.split(' ')
    const file = person.file ?? slug(person.name)
    const user = await ensureUser({
      email: `${file}@letitcast.demo`,
      firstName,
      lastName: rest.join(' '),
      accountType: 'talent',
      city: person.city,
      country: 'US',
    })
    die(
      `talent ${person.name}`,
      (await db.from('talent_profiles').upsert(
        {
          profile_id: user.id,
          headline: person.role === MENTOR ? 'Home cook · 30 years at the stove' : 'Home cook',
          bio: person.note ?? null,
          gender: person.gender,
          playing_age_min: person.age - 4,
          playing_age_max: person.age + 4,
          experience_level: 'Emerging',
          availability: 'available',
        },
        { onConflict: 'profile_id' },
      )).error,
    )
    const avatar = await uploadAsset(user.id, 'avatar', `/avatars/${file}.jpg`)
    await db.from('profiles').update({ avatar_url: avatar.url }).eq('id', user.id)
    const headshot = await uploadAsset(user.id, 'headshot', `/avatars/${file}.jpg`)
    const tape = await uploadAsset(user.id, 'selftape', `/casting-nonscripted/${file}.mp4`)
    for (const language of person.langs) {
      await db.from('talent_languages').upsert({ talent_id: user.id, language }, { onConflict: 'talent_id,language' })
    }
    if (cooking) await db.from('talent_skills').upsert({ talent_id: user.id, skill_id: cooking.id, level: 2 }, { onConflict: 'talent_id,skill_id' })
    talents[person.name] = { id: user.id, headshot: headshot.id, tape: tape.id }
  }
  console.log(`✓ talents             ${PEOPLE.length} with avatar, headshot and self-tape`)

  // ── La mémoire : Big Brother Australia, il y a quatre mois ──
  const bbProject = await ensureProject(org.id, team.peter, {
    title: 'Big Brother Australia',
    production_type: 'Reality TV',
    genre: 'Social experiment',
    company_name: 'A24 Unscripted',
    shooting_location: 'Sydney',
    synopsis: 'Sixteen strangers, one house, no way out but the vote.',
    status: 'cast',
  }, '/posters/big-brother-australia.png')
  const bbCasting = await ensureCasting(bbProject.id, team.peter, {
    title: 'Big Brother Australia — Season 16',
    description: 'Houseguests for season 27. Big personalities, real stories.',
    location: 'Sydney',
    compensation: 'Weekly stipend',
    format: 'non_scripted',
    deadline_at: ago(130 * DAY),
    published_at: ago(160 * DAY),
  })
  const bbRole = await ensureRole(bbCasting.id, {
    name: 'Houseguests',
    role_type: 'contestant',
    description: 'Strong opinions, a story to tell, at ease in front of a camera 24/7.',
    playing_age_min: 21,
    playing_age_max: 60,
    languages: ['en'],
    sort_order: 0,
  })

  // ── La file : MasterChef Australia — Season 17 ──
  const mcProject = await ensureProject(org.id, team.peter, {
    title: 'MasterChef Australia',
    production_type: 'Reality TV',
    genre: 'Cooking competition',
    company_name: 'A24 Unscripted',
    shooting_location: 'Melbourne',
    synopsis: 'The best home cooks in the country compete for the title — and the story of their kitchen.',
    status: 'casting',
  }, '/posters/masterchef-australia.png')
  const mcCasting = await ensureCasting(mcProject.id, team.peter, {
    title: 'MasterChef Australia — Season 17',
    description: 'We are looking for home cooks with a real story and a big personality. Cooking skill matters; being yourself on camera matters as much.',
    location: 'Melbourne',
    compensation: 'Weekly stipend + travel',
    format: 'non_scripted',
    deadline_at: new Date(Date.now() + 10 * DAY).toISOString(),
    published_at: ago(14 * DAY),
  })
  const roles = {
    [HOME]: await ensureRole(mcCasting.id, {
      name: HOME,
      role_type: 'contestant',
      description: 'Home cooks who cook for their family every day. Tell us your story, your flavours and what the kitchen means to you.',
      selftape_instructions: 'Two minutes, one dish, talking to the camera. Show us your kitchen and your personality.',
      playing_age_min: 21,
      playing_age_max: 60,
      languages: ['en'],
      skills: ['Cooking'],
      sort_order: 0,
    }),
    [MENTOR]: await ensureRole(mcCasting.id, {
      name: MENTOR,
      role_type: 'contestant',
      description: 'Experienced home cooks who mentor the contestants in the kitchen. A story, a signature dish, patience on camera.',
      selftape_instructions: 'Two minutes: your signature dish and the advice you would give a nervous contestant.',
      playing_age_min: 45,
      playing_age_max: 70,
      languages: ['en'],
      skills: ['Cooking'],
      sort_order: 1,
    }),
  }
  console.log('✓ castings            MasterChef Australia — Season 17 (open) · Big Brother Australia — Season 16 (memory)')

  // Le casting repart de zéro à chaque passage : mêmes conditions de démo.
  const roleIds = [bbRole, ...Object.values(roles)]
  const { data: oldApps } = await db.from('applications').select('id, talent_id, role_id').in('role_id', roleIds)
  const known = new Set(PEOPLE.map((person) => talents[person.name].id))
  const stale = (oldApps ?? []).filter((app) => known.has(app.talent_id)).map((app) => app.id)
  if (stale.length) {
    await db.from('candidate_reviews').delete().in('application_id', stale)
    await db.from('application_labels').delete().in('application_id', stale)
    await db.from('application_assignments').delete().in('application_id', stale)
    await db.from('events').delete().eq('entity_type', 'application').in('entity_id', stale)
    // Réécrire le statut demande de repartir d'une candidature neuve.
    await db.from('applications').delete().in('id', stale)
  }

  // Étiquettes de l'organisation.
  const labels = {}
  for (const label of LABELS) {
    const { data: existing } = await db.from('review_labels').select('*').eq('org_id', org.id).ilike('name', label.name).maybeSingle()
    if (existing) labels[label.name] = existing.id
    else {
      const { data, error } = await db.from('review_labels').insert({ org_id: org.id, created_by: team.peter, ...label }).select('id').single()
      die(`label ${label.name}`, error)
      labels[label.name] = data.id
    }
  }

  const vote = (applicationId, who, value, comment = null) =>
    db.from('candidate_reviews').upsert({ application_id: applicationId, reviewer_id: team[who], vote: value, comment }, { onConflict: 'application_id,reviewer_id' })
  const attention = (applicationId, who, type, at) =>
    db.from('events').insert({ type, actor_id: team[who], entity_type: 'application', entity_id: applicationId, org_id: org.id, occurred_at: at, source: 'seed' })
  const addTape = async (applicationId, tapeId, at) => {
    const { data, error } = await db
      .from('self_tapes')
      .upsert({ application_id: applicationId, media_asset_id: tapeId, submitted_at: at }, { onConflict: 'application_id,media_asset_id' })
      .select('id')
      .single()
    die('self_tapes', error)
    const score = 82 + Math.floor(Math.random() * 14)
    await db.from('tape_checks').upsert(
      {
        self_tape_id: data.id,
        duration_s: 95 + Math.floor(Math.random() * 40),
        width: 1080,
        height: 1920,
        framing: 'portrait',
        brightness: 0.52,
        has_audio: true,
        checks: [
          { key: 'framing', ok: true, detail: 'Portrait 9:16' },
          { key: 'definition', ok: true, detail: '1080p' },
          { key: 'duration', ok: true, detail: 'Under 3 minutes' },
          { key: 'light', ok: true, detail: 'Well lit' },
          { key: 'sound', ok: true, detail: 'Audio track present' },
        ],
        score,
      },
      { onConflict: 'self_tape_id' },
    )
  }

  // Big Brother : candidatures, votes et décisions d'il y a quatre mois.
  for (const person of PEOPLE.filter((p) => p.memory || p.pastPlain || p.pastCast)) {
    const talent = talents[person.name]
    const submitted = ago(150 * DAY + person.hours * HOUR)
    const app = await ensureApplication({ roleId: bbRole, talentId: talent.id, submittedAt: submitted, note: person.note })
    await addTape(app.id, talent.tape, submitted)
    for (const [who, value] of Object.entries(person.memory?.votes ?? {})) {
      await vote(app.id, who, value, value === 'good' ? person.memory.comment ?? null : null)
    }
    if (person.memory?.label) await db.from('application_labels').insert({ application_id: app.id, label_id: labels[person.memory.label], added_by: team.lara })
    if (person.pastCast) {
      await vote(app.id, 'peter', 'good', 'Our season winner.')
      await setStatus(app.id, 'cast', ago(128 * DAY))
    } else {
      await setStatus(app.id, 'not_selected', ago(132 * DAY))
    }
  }
  await db.from('casting_calls').update({ status: 'closed' }).eq('id', bbCasting.id)
  console.log('✓ memory              Big Brother: 3 noticed then passed, 1 passed, 1 cast')

  // MasterChef : la file d'aujourd'hui.
  for (const person of PEOPLE) {
    const talent = talents[person.name]
    const submitted = ago(person.hours * HOUR)
    const app = await ensureApplication({
      roleId: roles[person.role],
      talentId: talent.id,
      submittedAt: submitted,
      note: person.note,
      headshotId: person.note ? talent.headshot : null,
    })
    await addTape(app.id, talent.tape, submitted)
    for (const [who, [value, comment]] of Object.entries(person.votes ?? {})) {
      await vote(app.id, who, value, comment)
      // Ce que le lecteur enregistre vraiment : ouverte, puis regardée jusqu'au bout.
      await attention(app.id, who, 'AUDITION_OPENED', ago(person.hours * HOUR * 0.55))
      await attention(app.id, who, 'AUDITION_COMPLETED', ago(person.hours * HOUR * 0.5))
    }
    for (const name of person.labels ?? []) {
      await db.from('application_labels').insert({ application_id: app.id, label_id: labels[name], added_by: team.lara })
    }
    if (person.seen) await attention(app.id, 'peter', 'AUDITION_OPENED', ago(person.hours * HOUR * 0.4))
    if (person.opened) await attention(app.id, person.opened, 'AUDITION_OPENED', ago(person.hours * HOUR * 0.5))
    if (person.assign) {
      await db.from('application_assignments').upsert({ application_id: app.id, assignee_id: team[person.assign], assigned_by: team.lara }, { onConflict: 'application_id' })
    }
    await setStatus(app.id, person.status ?? 'submitted', ago(person.hours * HOUR * 0.3))
    person.applicationId = app.id
  }
  console.log(`✓ queue               ${PEOPLE.length} auditions on MasterChef Australia — Season 17`)

  // Les triggers ont notifié l'équipe et les talents de chaque candidature
  // rejouée : du bruit de démo, pas des événements. On l'efface.
  const demoIds = [...Object.values(team), ...Object.values(talents).map((talent) => talent.id)]
  await db.from('notifications').delete().gte('created_at', startedAt).in('recipient_id', demoIds)
  await db.from('email_outbox').delete().gte('created_at', startedAt).like('to_email', '%@letitcast.demo')

  // Vérification : le feed fait-il ce que la démo raconte ?
  const { data: feed, error: feedError } = await db.rpc('intelligence_feed', { p_casting: mcCasting.id })
  die('intelligence_feed', feedError)
  const byApp = new Map(feed.map((row) => [row.application_id, row]))
  const off = PEOPLE.filter((person) => byApp.get(person.applicationId)?.band !== person.band)
  const count = (band) => feed.filter((row) => row.band === band).length
  console.log(`✓ feed                priority ${count('priority')} · discovery ${count('discovery')} · all ${count('all')}`)
  for (const person of PEOPLE.filter((p) => p.memory)) {
    const reasons = byApp.get(person.applicationId)?.reasons ?? []
    const memory = reasons.find((reason) => reason.code === 'passed_but_noted')
    console.log(`  · ${person.name.padEnd(16)} ${memory ? `remembered from ${memory.project} (${memory.good_votes} good vote(s))` : '✖ no memory reason'}`)
  }
  if (off.length) {
    console.warn('! unexpected bands:')
    for (const person of off) console.warn(`  · ${person.name}: expected ${person.band}, got ${byApp.get(person.applicationId)?.band} ${JSON.stringify(byApp.get(person.applicationId)?.reasons)}`)
  }

  console.log(`\nOpen /studio/casting/${mcCasting.id}/review as peter@letitcast.demo`)
  console.log('Teammates: lara@ · eden@ · julie@letitcast.demo (same password)\n')
}

await seed()
