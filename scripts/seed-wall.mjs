#!/usr/bin/env node
/**
 * Let It Cast — The Wall™ demo.
 *
 * A scripted feature in Peter's organization, cast from real self-tapes:
 *
 *   Une saison chez les Parc   8 roles — 2 lead, 3 supporting, 3 small
 *
 * Five roles have an actor on the Wall (one of them confirmed as Cast), two
 * are open with auditions waiting, one has no audition yet. Votes come from
 * the four producers, so "interesting" counts are real. Two roles have a
 * selection history (the team changed its mind).
 *
 *   npm run db:seed:wall
 *
 * Idempotent: running it again resets the project to the same state. Requires
 * `npm run db:seed` and `npm run db:seed:review` first (Peter, the A24
 * organization, the team and the talents with their tapes). The audition
 * stills are produced by the browser the first time someone opens the Wall.
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
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }

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

async function ensureTalent({ email, firstName, lastName, city, gender, age, avatar, tape, headline }) {
  let user = await findUser(email)
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, account_type: 'talent' },
    })
    die(`createUser ${email}`, error)
    user = data.user
  }
  die(
    `profile ${email}`,
    (await db
      .from('profiles')
      .update({
        account_type: 'talent',
        first_name: firstName,
        last_name: lastName,
        city,
        country: 'FR',
        onboarding_step: null,
        onboarding_completed_at: new Date().toISOString(),
        adult_confirmed_at: new Date().toISOString(),
        email_notifications: false,
      })
      .eq('id', user.id)).error,
  )
  die(
    `talent ${email}`,
    (await db.from('talent_profiles').upsert(
      {
        profile_id: user.id,
        headline,
        gender,
        playing_age_min: age - 5,
        playing_age_max: age + 5,
        experience_level: 'Mid-career',
        availability: 'available',
        nationalities: ['French'],
      },
      { onConflict: 'profile_id' },
    )).error,
  )
  const avatarAsset = await uploadAsset(user.id, 'avatar', avatar)
  await db.from('profiles').update({ avatar_url: avatarAsset.url }).eq('id', user.id)
  await db.from('talent_languages').upsert({ talent_id: user.id, language: 'fr' }, { onConflict: 'talent_id,language' })
  const tapeAsset = await uploadAsset(user.id, 'selftape', tape)
  return { id: user.id, tape: tapeAsset.id }
}

// ── Les comédiens ───────────────────────────────────────────────────────────
//
// Les cinq comédiennes du seed principal ont déjà leur tape ; les cinq autres
// sont créés ici à partir des tapes de public/media.

const EXISTING = {
  camille: 'camille@letitcast.demo',
  sarah: 'sarah@letitcast.demo',
  nadia: 'nadia@letitcast.demo',
  ines: 'ines@letitcast.demo',
  hannah: 'hannah@letitcast.demo',
}

const NEW_TALENTS = {
  eva: { email: 'eva.sokolov@letitcast.demo', firstName: 'Eva', lastName: 'Sokolov', city: 'Paris', gender: 'Female', age: 29, avatar: '/avatars/eva-sokolov.jpg', tape: '/media/Eva Sokolov.mp4', headline: 'Comédienne · cinéma' },
  julien: { email: 'julien.faure@letitcast.demo', firstName: 'Julien', lastName: 'Faure', city: 'Paris', gender: 'Male', age: 34, avatar: '/avatars/julien-faure.jpg', tape: '/media/Julien Faure.mp4', headline: 'Comédien · théâtre & cinéma' },
  karim: { email: 'karim.belkacem@letitcast.demo', firstName: 'Karim', lastName: 'Belkacem', city: 'Marseille', gender: 'Male', age: 31, avatar: '/avatars/karim-belkacem.jpg', tape: '/media/Karim Belkacem.mp4', headline: 'Comédien' },
  marc: { email: 'marc.dubreuil@letitcast.demo', firstName: 'Marc', lastName: 'Dubreuil', city: 'Lyon', gender: 'Male', age: 52, avatar: '/avatars/marc-dubreuil.jpg', tape: '/media/Marc Dubreuil.mp4', headline: 'Comédien · 25 ans de plateau' },
  thomas: { email: 'thomas.granger@letitcast.demo', firstName: 'Thomas', lastName: 'Granger', city: 'Nantes', gender: 'Male', age: 38, avatar: '/avatars/thomas-granger.jpg', tape: '/media/Thomas Granger.mp4', headline: 'Comédien' },
}

// ── Le film ─────────────────────────────────────────────────────────────────

const FAMILY = 'La famille Parc'

/**
 * Chaque rôle : ses candidats (clé de comédien ou `extra` = tapes de la démo
 * MasterChef pour le volume), les votes de l'équipe, et ce qui est sur le mur.
 * Votes : p = Peter, l = Lara, e = Eden, j = Julie ; g = Yes, m = Maybe, n = No.
 */
const ROLES = [
  {
    name: 'Clem', role_type: 'lead', sort_order: 0, role_group: FAMILY, gender_pref: 'Female', playing_age_min: 17, playing_age_max: 22,
    description: 'Dix-neuf ans, la cadette des Parc. Drôle, cash, et la seule à dire ce que tout le monde pense.',
    cast: { ines: 'pg lg eg', hannah: 'lg em', eva: 'jm pm', nadia: 'ln', camille: 'em' },
    extra: 12, extraVotes: ['lm', 'jg', 'en', '', 'pm', '', 'jm', '', 'ln', '', 'em', ''],
    wall: { pick: 'ines', history: [['hannah', 'lara', 3 * DAY], ['ines', 'peter', 20 * HOUR]] },
    comments: { ines: { peter: 'She plays the silence before the joke. That is Clem.', lara: 'Second take is the one.' } },
  },
  {
    name: 'Alizée', role_type: 'lead', sort_order: 1, gender_pref: 'Female', playing_age_min: 25, playing_age_max: 32,
    description: 'La meilleure amie de Clem, revenue de Lisbonne sans prévenir personne.',
    cast: { sarah: 'pg em', camille: 'lm jg', nadia: 'em', hannah: 'jm' },
    extra: 8, extraVotes: ['pg', 'lm', '', 'jn', 'em', '', '', 'lm'],
  },
  {
    name: 'Mademoiselle Lecoutre', role_type: 'supporting', sort_order: 0, gender_pref: 'Female', playing_age_min: 38, playing_age_max: 50,
    description: 'La prof de piano. Sévère, élégante, et beaucoup plus tendre qu’elle ne le laisse voir.',
    cast: { camille: 'pg lg jg', nadia: 'lm', hannah: 'en' },
    extra: 5, extraVotes: ['', 'jm', '', 'pn', ''],
    wall: { pick: 'camille', history: [['camille', 'lara', 5 * DAY]] },
    status: { camille: 'callback' },
  },
  {
    name: 'Julien', role_type: 'supporting', sort_order: 1, role_group: FAMILY, gender_pref: 'Male', playing_age_min: 30, playing_age_max: 38,
    description: 'Le grand frère, rentré vivre chez ses parents « pour quelques semaines ».',
    cast: { julien: 'pg lg eg jg', thomas: 'lm em', karim: 'jm' },
    extra: 6, extraVotes: ['', 'lm', '', '', 'en', ''],
    wall: { pick: 'julien', history: [['thomas', 'eden', 6 * DAY], ['julien', 'lara', 4 * DAY]] },
    status: { julien: 'cast' },
    comments: { julien: { lara: 'Offer accepted — confirmed with his agent on Thursday.' } },
  },
  {
    name: 'Michel', role_type: 'supporting', sort_order: 2, role_group: FAMILY, gender_pref: 'Male', playing_age_min: 50, playing_age_max: 62,
    description: 'Le père. Bricoleur, taiseux, il répare tout sauf ce qui compte.',
    cast: { marc: 'pg eg', karim: 'ln', thomas: 'jm' },
    extra: 4, extraVotes: ['', 'em', '', ''],
    wall: { pick: 'marc', history: [['marc', 'peter', 2 * DAY]] },
    status: { marc: 'shortlisted' },
  },
  {
    name: 'Maman Parc', role_type: 'small', sort_order: 0, role_group: FAMILY, gender_pref: 'Female', playing_age_min: 48, playing_age_max: 60,
    description: 'Trois scènes, toutes à table. Elle a toujours le dernier mot.',
    cast: { nadia: 'lg jm', sarah: 'pm', camille: 'em' },
    extra: 3, extraVotes: ['', 'ln', ''],
    wall: { pick: 'nadia', history: [['nadia', 'julie', 30 * HOUR]] },
    status: { nadia: 'shortlisted' },
  },
  {
    name: 'La Radiologue', role_type: 'small', sort_order: 1, gender_pref: null, playing_age_min: 30, playing_age_max: 55,
    description: 'Une scène, une annonce. Il faut qu’on la croie en dix secondes.',
    cast: { eva: 'lm', hannah: 'jg' },
    extra: 2, extraVotes: ['', 'pn'],
  },
  {
    name: 'Mélusine', role_type: 'small', sort_order: 2, gender_pref: 'Female', playing_age_min: 8, playing_age_max: 11,
    description: 'La nièce de neuf ans. Casting en cours avec les agences jeunesse.',
    cast: {},
    extra: 0,
  },
]

const VOTE = { g: 'good', m: 'maybe', n: 'no' }
const WHO = { p: 'peter', l: 'lara', e: 'eden', j: 'julie' }
const parseVotes = (text) =>
  (text ?? '')
    .split(' ')
    .filter(Boolean)
    .map((pair) => [WHO[pair[0]], VOTE[pair[1]]])

async function seed() {
  const startedAt = new Date().toISOString()
  const { data: org } = await db.from('organizations').select('*').eq('slug', 'a24-demo').single()
  if (!org) die('org', { message: 'run `npm run db:seed` first' })

  const team = {}
  for (const key of ['peter', 'lara', 'eden', 'julie']) {
    const user = await findUser(`${key}@letitcast.demo`)
    if (!user) die(key, { message: 'run `npm run db:seed` and `npm run db:seed:review` first' })
    team[key] = user.id
  }

  // ── Les comédiens et leur tape ──
  const talents = {}
  for (const [key, email] of Object.entries(EXISTING)) {
    const user = await findUser(email)
    if (!user) die(email, { message: 'run `npm run db:seed` first' })
    const { data: tape } = await db
      .from('media_assets')
      .select('id')
      .eq('owner_id', user.id)
      .eq('kind', 'selftape')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!tape) die(email, { message: 'no self-tape — run `npm run db:seed` first' })
    talents[key] = { id: user.id, tape: tape.id }
  }
  for (const [key, person] of Object.entries(NEW_TALENTS)) talents[key] = await ensureTalent(person)

  // Le volume : les comédiens de la démo MasterChef, chacun avec sa tape.
  const { data: extraTapes } = await db
    .from('media_assets')
    .select('id, owner_id, path')
    .eq('kind', 'selftape')
    .like('path', '%/selftape-%')
    .order('path')
  const known = new Set(Object.values(talents).map((talent) => talent.id))
  const extras = []
  const seenOwners = new Set()
  for (const tape of extraTapes ?? []) {
    if (known.has(tape.owner_id) || seenOwners.has(tape.owner_id)) continue
    seenOwners.add(tape.owner_id)
    extras.push({ id: tape.owner_id, tape: tape.id })
  }
  if (extras.length < 12) die('extras', { message: 'run `npm run db:seed:review` first (MasterChef tapes)' })
  console.log(`✓ talents             ${Object.keys(talents).length} scripted actors · ${extras.length} extra tapes`)

  // ── Projet, casting, rôles ──
  const projectRow = {
    title: 'Une saison chez les Parc',
    subtitle: 'Feature film',
    production_type: 'Feature film',
    genre: 'Comedy drama',
    company_name: 'A24 France',
    director_name: 'Anaïs Roche',
    casting_director_name: 'Lara Khan',
    shooting_location: 'Nantes',
    shooting_start: new Date(Date.now() + 70 * DAY).toISOString().slice(0, 10),
    shooting_end: new Date(Date.now() + 110 * DAY).toISOString().slice(0, 10),
    synopsis: 'Un été, une maison trop petite, une famille qui ne se dit rien. Jusqu’au retour d’Alizée.',
    status: 'casting',
    wall_order: null,
  }
  let { data: project } = await db.from('projects').select('*').eq('org_id', org.id).eq('title', projectRow.title).maybeSingle()
  if (project) die('project', (await db.from('projects').update(projectRow).eq('id', project.id)).error)
  else {
    const { data, error } = await db.from('projects').insert({ org_id: org.id, created_by: team.peter, ...projectRow }).select('*').single()
    die('project', error)
    project = data
  }
  const poster = await uploadAsset(team.peter, 'poster', '/posters/la-nuit-vive.png')
  await db.from('projects').update({ poster_url: poster.url }).eq('id', project.id)

  const castingRow = {
    title: 'Une saison chez les Parc — Casting',
    description: 'Long métrage, comédie dramatique. Tournage à Nantes cet été. Self-tape sur les scènes jointes, deux prises maximum.',
    location: 'Nantes',
    compensation: 'Convention collective + défraiement',
    format: 'scripted',
    status: 'published',
    published_at: ago(12 * DAY),
    deadline_at: new Date(Date.now() + 9 * DAY).toISOString(),
  }
  let { data: casting } = await db.from('casting_calls').select('*').eq('project_id', project.id).eq('title', castingRow.title).maybeSingle()
  if (casting) die('casting', (await db.from('casting_calls').update(castingRow).eq('id', casting.id)).error)
  else {
    const { data, error } = await db.from('casting_calls').insert({ project_id: project.id, created_by: team.peter, ...castingRow }).select('*').single()
    die('casting', error)
    casting = data
  }

  const roleIds = {}
  for (const role of ROLES) {
    const row = {
      name: role.name,
      role_type: role.role_type,
      sort_order: role.sort_order,
      role_group: role.role_group ?? null,
      description: role.description,
      gender_pref: role.gender_pref,
      playing_age_min: role.playing_age_min,
      playing_age_max: role.playing_age_max,
      languages: ['fr'],
      selftape_instructions: 'Les deux scènes jointes, face caméra, plan taille. Deux prises au maximum.',
      status: 'open',
    }
    const { data: existing } = await db.from('roles').select('id').eq('casting_call_id', casting.id).eq('name', role.name).maybeSingle()
    if (existing) {
      die(`role ${role.name}`, (await db.from('roles').update(row).eq('id', existing.id)).error)
      roleIds[role.name] = existing.id
    } else {
      const { data, error } = await db.from('roles').insert({ casting_call_id: casting.id, ...row }).select('id').single()
      die(`role ${role.name}`, error)
      roleIds[role.name] = data.id
    }
  }
  console.log(`✓ project             ${projectRow.title} · ${ROLES.length} roles`)

  // ── Repartir de zéro : candidatures, votes, mur ──
  const allRoleIds = Object.values(roleIds)
  await db.from('wall_selection_history').delete().eq('project_id', project.id)
  await db.from('wall_selections').delete().eq('project_id', project.id)
  const { data: oldApps } = await db.from('applications').select('id').in('role_id', allRoleIds)
  const stale = (oldApps ?? []).map((app) => app.id)
  if (stale.length) {
    await db.from('candidate_reviews').delete().in('application_id', stale)
    await db.from('events').delete().eq('entity_type', 'application').in('entity_id', stale)
    await db.from('applications').delete().in('id', stale)
  }

  // ── Candidatures ──
  const applications = {} // `${role}:${talentKey}` → application id
  let total = 0
  let extraCursor = 0
  for (const role of ROLES) {
    const entries = [
      ...Object.entries(role.cast).map(([key, votes], index) => ({ key, talent: talents[key], votes, hours: 30 + index * 17 })),
      ...Array.from({ length: role.extra }, (_, index) => {
        const extra = extras[(extraCursor + index) % extras.length]
        return { key: `extra-${index}`, talent: extra, votes: role.extraVotes?.[index] ?? '', hours: 6 + index * 11 }
      }),
    ]
    extraCursor += role.extra
    for (const entry of entries) {
      const submittedAt = ago(entry.hours * HOUR)
      const { data: app, error } = await db
        .from('applications')
        .insert({ role_id: roleIds[role.name], talent_id: entry.talent.id, status: 'submitted', submitted_at: submittedAt, source: 'seed' })
        .select('id')
        .single()
      die(`application ${role.name}`, error)
      die(
        'self_tape',
        (await db.from('self_tapes').insert({ application_id: app.id, media_asset_id: entry.talent.tape, submitted_at: submittedAt })).error,
      )
      for (const [who, vote] of parseVotes(entry.votes)) {
        const comment = role.comments?.[entry.key]?.[who] ?? null
        die('vote', (await db.from('candidate_reviews').insert({ application_id: app.id, reviewer_id: team[who], vote, comment })).error)
      }
      const status = role.status?.[entry.key] ?? (entry.votes ? 'under_review' : 'submitted')
      if (status !== 'submitted') {
        die(`status ${status}`, (await db.from('applications').update({ status, decided_at: ago(entry.hours * HOUR * 0.4) }).eq('id', app.id)).error)
      }
      applications[`${role.name}:${entry.key}`] = app.id
      total += 1
    }
  }
  console.log(`✓ auditions           ${total} submitted, rated by Peter, Lara, Eden and Julie`)

  // ── Le mur : cinq rôles sur huit, deux avec un historique ──
  const name = (key) => {
    const person = NEW_TALENTS[key]
    if (person) return `${person.firstName} ${person.lastName}`
    return { camille: 'Camille Vidal', sarah: 'Sarah Lefèvre', nadia: 'Nadia Ferrand', ines: 'Inès Karim', hannah: 'Hannah Levy' }[key]
  }
  let placed = 0
  for (const role of ROLES.filter((item) => item.wall)) {
    let previous = null
    for (const [key, who, before] of role.wall.history) {
      const applicationId = applications[`${role.name}:${key}`]
      die(
        'history',
        (await db.from('wall_selection_history').insert({
          role_id: roleIds[role.name],
          project_id: project.id,
          previous_application_id: previous ? applications[`${role.name}:${previous}`] : null,
          new_application_id: applicationId,
          previous_name: previous ? name(previous) : null,
          new_name: name(key),
          changed_by: team[who],
          changed_at: ago(before),
        })).error,
      )
      previous = key
    }
    const [, lastWho, lastBefore] = role.wall.history.at(-1)
    die(
      'wall',
      (await db.from('wall_selections').insert({
        role_id: roleIds[role.name],
        project_id: project.id,
        application_id: applications[`${role.name}:${role.wall.pick}`],
        selected_by: team[lastWho],
        selected_at: ago(lastBefore),
      })).error,
    )
    placed += 1
  }
  console.log(`✓ the wall            ${placed} of ${ROLES.length} roles selected · Julien confirmed as Cast`)

  // Les triggers ont notifié tout le monde : du bruit de démo, on l'efface.
  const demoIds = [...Object.values(team), ...Object.values(talents).map((t) => t.id), ...extras.map((t) => t.id)]
  await db.from('notifications').delete().gte('created_at', startedAt).in('recipient_id', demoIds)
  await db.from('email_outbox').delete().gte('created_at', startedAt).like('to_email', '%@letitcast.demo')

  // Vérification : ce que le mur lira.
  const { data: wall, error: wallError } = await db.from('v_wall_roles').select('name, auditions, interesting, actor_name').eq('project_id', project.id)
  die('v_wall_roles', wallError)
  for (const row of wall) console.log(`  · ${row.name.padEnd(22)} ${String(row.auditions).padStart(2)} auditions · ${String(row.interesting).padStart(2)} interesting · ${row.actor_name ?? '— open —'}`)

  console.log(`\nOpen /studio/projects/${project.id}/wall as peter@letitcast.demo`)
}

await seed()
