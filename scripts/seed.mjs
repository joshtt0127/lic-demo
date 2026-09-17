#!/usr/bin/env node
/**
 * Let It Cast — demo seed.
 *
 * Turns the old fixtures into real rows: two demo accounts you can sign in with,
 * a production organization with a project in casting, published roles, talents
 * with profiles and media, real applications and team votes — so both sides of
 * the marketplace show something true on a fresh project.
 *
 *   npm run db:seed          create or refresh the demo data
 *   npm run db:seed -- reset delete the demo accounts and their data first
 *
 * Uses the service-role key from `.env.local` (local only, never in the bundle).
 * Files are uploaded from `public/` into the real storage buckets, including a
 * self-tape into the private one.
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

const URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = env.DEMO_PASSWORD || 'LetItCast2026!'

if (!URL || !SERVICE_KEY) {
  console.error('✖ .env.local needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' }

function die(label, error) {
  if (!error) return
  console.error(`✖ ${label}: ${error.message ?? JSON.stringify(error)}`)
  process.exit(1)
}

/** Uploads a file from public/ and records the media_assets row. */
async function uploadAsset(ownerId, kind, publicPath, { caption = null, sortOrder = 0 } = {}) {
  const absolute = path.join(ROOT, 'public', publicPath.replace(/^\//, ''))
  if (!existsSync(absolute)) {
    console.warn(`  ! missing asset ${publicPath} — skipped`)
    return null
  }
  const extension = path.extname(absolute).toLowerCase()
  const bucket = kind === 'selftape' ? 'selftapes' : kind === 'avatar' || kind === 'cover' ? 'avatars' : 'media'
  const objectPath = `${ownerId}/${kind}-${path.basename(absolute).replace(/[^a-zA-Z0-9.-]/g, '-')}`
  const body = readFileSync(absolute)

  const { error: uploadError } = await db.storage
    .from(bucket)
    .upload(objectPath, body, { contentType: MIME[extension] ?? 'application/octet-stream', upsert: true })
  die(`upload ${publicPath}`, uploadError)

  const { data, error } = await db
    .from('media_assets')
    .upsert(
      {
        owner_id: ownerId,
        kind,
        bucket,
        path: objectPath,
        mime: MIME[extension] ?? null,
        bytes: body.byteLength,
        caption,
        sort_order: sortOrder,
      },
      { onConflict: 'bucket,path' },
    )
    .select('*')
    .single()
  die(`media_assets ${publicPath}`, error)

  const url =
    bucket === 'selftapes' ? null : db.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl
  return { ...data, url }
}

async function findUserByEmail(email) {
  // The demo set is tiny; one page is plenty.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  die('listUsers', error)
  return data.users.find((user) => user.email === email) ?? null
}

async function ensureUser({ email, firstName, lastName, accountType, city, country }) {
  let user = await findUserByEmail(email)
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

  const { error } = await db
    .from('profiles')
    .update({
      account_type: accountType,
      first_name: firstName,
      last_name: lastName,
      city,
      country,
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id)
  die(`profile ${email}`, error)

  return user
}

async function resetDemo() {
  console.log('Resetting demo accounts…')
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  die('listUsers', error)
  const demo = data.users.filter((user) => user.email?.endsWith('@letitcast.demo'))
  for (const user of demo) {
    await db.auth.admin.deleteUser(user.id)
    console.log(`  · deleted ${user.email}`)
  }
  // Organizations are owned by those users but not cascade-deleted, so drop the
  // demo org explicitly (projects → castings → roles → applications cascade).
  const { data: orgs } = await db.from('organizations').select('id, slug').eq('slug', 'a24-demo')
  for (const org of orgs ?? []) {
    await db.from('organizations').delete().eq('id', org.id)
    console.log(`  · deleted org ${org.slug}`)
  }
}

// ── Demo content ─────────────────────────────────────────────────────────────

const TALENTS = [
  {
    email: 'maya@letitcast.demo',
    firstName: 'Maya',
    lastName: 'Reyes',
    city: 'Los Angeles',
    country: 'US',
    avatar: '/avatars/maya-reyes.png',
    headshots: ['/posters/p1.png', '/posters/p2.png'],
    talent: {
      headline: 'Actress · 2x lead · SAG-AFTRA',
      bio: 'Los Angeles based actress working across drama and thriller. Trained at Juilliard, three seasons of stage work before moving to screen. Most at home in roles that hold silence.',
      gender: 'Female',
      playing_age_min: 24,
      playing_age_max: 34,
      height_cm: 170,
      union_name: 'SAG-AFTRA',
      experience_level: 'Mid-career',
      availability: 'available',
      nationalities: ['American'],
      accents: ['Standard American', 'RP / British'],
      ethnicities: ['Latino / Hispanic'],
      agency_name: 'Vertice Talent',
      agent_name: 'Naomi Cross',
      agent_email: 'naomi@verticetalent.demo',
    },
    skills: [['Drama', 3], ['Vulnerability', 3], ['Stage combat', 2], ['Singing', 2], ['Horse riding', 1]],
    languages: ['en', 'es'],
    credits: [
      { title: 'Evermore', role_name: 'Fanny Brice', category: 'TV series', year: '2026', company: 'A24', director: 'Lara Khan', location: 'Los Angeles' },
      { title: 'La Nuit Vive', role_name: 'Camille', category: 'Film', year: '2025', company: 'Pathé', director: 'Marc Soler', location: 'Paris' },
      { title: 'Echo Park', role_name: 'The Drifter', category: 'Music video', year: '2024', company: 'WMG' },
    ],
    training: [
      { school: 'Juilliard School', program: 'Drama, BFA', start_year: '2016', end_year: '2020' },
      { school: 'Upright Citizens Brigade', program: 'Improvisation', start_year: '2021' },
    ],
  },
  {
    email: 'camille@letitcast.demo',
    firstName: 'Camille',
    lastName: 'Vidal',
    city: 'Marseille',
    country: 'FR',
    avatar: '/avatars/camille-vidal.jpg',
    selftape: '/media/Camille Vidal.mp4',
    talent: {
      headline: 'Comédienne · théâtre & cinéma',
      gender: 'Female',
      playing_age_min: 34,
      playing_age_max: 45,
      experience_level: 'Established',
      nationalities: ['French'],
      availability: 'available',
    },
    skills: [['Drama', 3], ['Classical / Shakespeare', 3]],
    languages: ['fr', 'en'],
  },
  {
    email: 'sarah@letitcast.demo',
    firstName: 'Sarah',
    lastName: 'Lefèvre',
    city: 'Paris',
    country: 'FR',
    avatar: '/avatars/sarah-lefevre.jpg',
    selftape: '/media/Sarah Lefevre.mp4',
    talent: {
      headline: 'Actrice · drame',
      gender: 'Female',
      playing_age_min: 36,
      playing_age_max: 48,
      experience_level: 'Star',
      nationalities: ['French'],
      availability: 'on_project',
    },
    skills: [['Drama', 3], ['Improvisation', 2]],
    languages: ['fr', 'en', 'es'],
  },
  {
    email: 'nadia@letitcast.demo',
    firstName: 'Nadia',
    lastName: 'Ferrand',
    city: 'Lyon',
    country: 'FR',
    avatar: '/avatars/nadia-ferrand.jpg',
    selftape: '/media/Nadia Ferrand.mp4',
    talent: {
      headline: 'Comédienne',
      gender: 'Female',
      playing_age_min: 32,
      playing_age_max: 42,
      experience_level: 'Mid-career',
      nationalities: ['French'],
      availability: 'available',
    },
    skills: [['Drama', 2], ['Martial arts', 2]],
    languages: ['fr', 'en'],
  },
  {
    email: 'ines@letitcast.demo',
    firstName: 'Inès',
    lastName: 'Karim',
    city: 'Paris',
    country: 'FR',
    avatar: '/avatars/ines-karim.jpg',
    selftape: '/media/Ines Karim.mp4',
    talent: {
      headline: 'Actrice multilingue',
      gender: 'Female',
      playing_age_min: 26,
      playing_age_max: 36,
      experience_level: 'Emerging',
      nationalities: ['French', 'Moroccan'],
      availability: 'available',
    },
    skills: [['Drama', 2], ['Contemporary dance', 2]],
    languages: ['fr', 'en', 'ar'],
  },
  {
    email: 'hannah@letitcast.demo',
    firstName: 'Hannah',
    lastName: 'Levy',
    city: 'New York',
    country: 'US',
    avatar: '/avatars/hannah-levy.jpg',
    selftape: '/media/Hannah Levy.mp4',
    talent: {
      headline: 'Actress · comedy & drama',
      gender: 'Female',
      playing_age_min: 25,
      playing_age_max: 35,
      experience_level: 'Mid-career',
      nationalities: ['American'],
      availability: 'available',
    },
    skills: [['Comedy', 3], ['Comedic timing', 3], ['Drama', 2]],
    languages: ['en'],
  },
]

async function seed() {
  console.log(`\nSeeding ${URL}\n`)

  // ── Production side ──
  const peter = await ensureUser({
    email: 'peter@letitcast.demo',
    firstName: 'Peter',
    lastName: 'Known',
    accountType: 'production',
    city: 'Los Angeles',
    country: 'US',
  })
  die(
    'production_profiles',
    (await db.from('production_profiles').upsert({ profile_id: peter.id, job_title: 'Casting director' }, { onConflict: 'profile_id' })).error,
  )
  const peterAvatar = await uploadAsset(peter.id, 'avatar', '/avatars/peter-known.jpg')
  if (peterAvatar) {
    await db.from('profiles').update({ avatar_url: peterAvatar.url }).eq('id', peter.id)
  }
  console.log('✓ production account  peter@letitcast.demo')

  const { data: org, error: orgError } = await db
    .from('organizations')
    .upsert(
      {
        name: 'A24',
        slug: 'a24-demo',
        description: 'Independent film and television studio.',
        company_type: 'Studio',
        city: 'New York',
        country: 'US',
        created_by: peter.id,
      },
      { onConflict: 'slug' },
    )
    .select('*')
    .single()
  die('organizations', orgError)

  die(
    'organization_members',
    (await db
      .from('organization_members')
      .upsert({ org_id: org.id, profile_id: peter.id, role: 'owner', status: 'active' }, { onConflict: 'org_id,profile_id' })).error,
  )
  console.log('✓ organization        A24 (owner: Peter Known)')

  // ── Talents ──
  const talentIds = {}
  for (const person of TALENTS) {
    const user = await ensureUser({
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      accountType: 'talent',
      city: person.city,
      country: person.country,
    })
    talentIds[person.email] = user.id

    die(
      `talent_profiles ${person.email}`,
      (await db.from('talent_profiles').upsert({ profile_id: user.id, ...person.talent }, { onConflict: 'profile_id' })).error,
    )

    if (person.avatar) {
      const avatar = await uploadAsset(user.id, 'avatar', person.avatar)
      if (avatar) await db.from('profiles').update({ avatar_url: avatar.url }).eq('id', user.id)
    }
    for (const [index, headshot] of (person.headshots ?? []).entries()) {
      await uploadAsset(user.id, 'headshot', headshot, { sortOrder: index })
    }

    for (const [name, level] of person.skills ?? []) {
      const { data: skill } = await db.from('skills').select('id').ilike('name', name).maybeSingle()
      if (!skill) continue
      await db
        .from('talent_skills')
        .upsert({ talent_id: user.id, skill_id: skill.id, level }, { onConflict: 'talent_id,skill_id' })
    }

    for (const code of person.languages ?? []) {
      await db
        .from('talent_languages')
        .upsert({ talent_id: user.id, language: code }, { onConflict: 'talent_id,language' })
    }

    if (person.credits) {
      await db.from('credits').delete().eq('talent_id', user.id)
      await db
        .from('credits')
        .insert(person.credits.map((credit, index) => ({ talent_id: user.id, ...credit, sort_order: index })))
    }
    if (person.training) {
      await db.from('training').delete().eq('talent_id', user.id)
      await db
        .from('training')
        .insert(person.training.map((entry, index) => ({ talent_id: user.id, ...entry, sort_order: index })))
    }

    console.log(`✓ talent account      ${person.email}`)
  }

  // ── Projects, castings, roles ──
  const projects = [
    {
      title: 'Les Ombres de Midi',
      poster: '/posters/les-ombres-de-midi.png',
      production_type: 'Film',
      genre: 'Psychological thriller',
      company_name: 'Studio 13 Productions',
      director_name: 'Claire Besson',
      shooting_location: 'Marseille, France',
      synopsis:
        "Une enquêtrice revient dans la ville qu'elle avait fuie pour élucider la disparition d'une adolescente — et découvre que tout le monde y a quelque chose à cacher.",
      director_brief:
        "On cherche une présence qui tient le plan sans parler. Chloé n'explique jamais ce qu'elle ressent, elle le laisse fuiter.",
      status: 'casting',
      casting: {
        title: 'Les Ombres de Midi — casting principal',
        location: 'Marseille',
        compensation: 'SAG scale + 10%',
        deadlineDays: 21,
        roles: [
          {
            name: 'Inspectrice Chloé Marchand',
            role_type: 'lead',
            description: "La quarantaine, armée d'un calme qui inquiète. Revient sur les lieux de son enfance.",
            gender_pref: 'Female',
            playing_age_min: 35,
            playing_age_max: 45,
            languages: ['fr', 'en'],
            skills: ['Drama'],
            selftape_instructions:
              'Scène 12, en français. Plan poitrine, lumière naturelle, une seule prise sans coupe.',
            sort_order: 0,
          },
          {
            name: 'Agnès Marchand',
            role_type: 'supporting',
            description: 'La mère. Soixante-dix ans, la mémoire comme une arme.',
            gender_pref: 'Female',
            playing_age_min: 60,
            playing_age_max: 75,
            languages: ['fr'],
            sort_order: 1,
          },
          {
            name: 'Rémy Jourdain',
            role_type: 'supporting',
            description: "Le collègue resté sur place. Loyal jusqu'au moment où il ne l'est plus.",
            gender_pref: 'Male',
            playing_age_min: 40,
            playing_age_max: 50,
            languages: ['fr'],
            sort_order: 2,
          },
        ],
      },
    },
    {
      title: 'Evermore',
      poster: '/posters/evermore.png',
      production_type: 'TV series',
      genre: 'Drama',
      company_name: 'A24',
      director_name: 'Lara Khan',
      shooting_location: 'Los Angeles',
      synopsis:
        'A jazz singer in 1920s New York trades the life she built for the spotlight she always wanted.',
      status: 'casting',
      casting: {
        title: 'Evermore — season 1',
        location: 'Los Angeles',
        compensation: 'Series regular, negotiable',
        deadlineDays: 12,
        roles: [
          {
            name: 'Fanny Brice',
            role_type: 'lead',
            description: 'Sharp-tongued, ambitious, funnier than everyone in the room and lonelier too.',
            gender_pref: 'Female',
            playing_age_min: 24,
            playing_age_max: 34,
            languages: ['en'],
            skills: ['Singing', 'Drama'],
            selftape_instructions: 'Scene 4 opposite Jake. Two takes: one angry, one amused.',
            sort_order: 0,
          },
        ],
      },
    },
  ]

  const roleIds = {}
  for (const project of projects) {
    const { casting, poster, ...projectRow } = project
    const { data: created, error: projectError } = await db
      .from('projects')
      .upsert({ org_id: org.id, created_by: peter.id, ...projectRow }, { onConflict: 'org_id,title' })
      .select('*')
      .single()

    // No unique constraint on (org_id, title): fall back to a lookup + insert.
    let projectRecord = created
    if (projectError) {
      const { data: existing } = await db
        .from('projects')
        .select('*')
        .eq('org_id', org.id)
        .eq('title', projectRow.title)
        .maybeSingle()
      if (existing) {
        const { data: updated } = await db
          .from('projects')
          .update(projectRow)
          .eq('id', existing.id)
          .select('*')
          .single()
        projectRecord = updated
      } else {
        const { data: inserted, error } = await db
          .from('projects')
          .insert({ org_id: org.id, created_by: peter.id, ...projectRow })
          .select('*')
          .single()
        die(`projects ${projectRow.title}`, error)
        projectRecord = inserted
      }
    }

    if (poster) {
      const asset = await uploadAsset(peter.id, 'poster', poster)
      if (asset) await db.from('projects').update({ poster_url: asset.url }).eq('id', projectRecord.id)
    }

    const deadline = new Date(Date.now() + casting.deadlineDays * 86400000).toISOString()
    const { data: existingCasting } = await db
      .from('casting_calls')
      .select('*')
      .eq('project_id', projectRecord.id)
      .eq('title', casting.title)
      .maybeSingle()

    let castingRecord = existingCasting
    if (!castingRecord) {
      const { data: inserted, error } = await db
        .from('casting_calls')
        .insert({
          project_id: projectRecord.id,
          title: casting.title,
          location: casting.location,
          compensation: casting.compensation,
          deadline_at: deadline,
          status: 'published',
          published_at: new Date().toISOString(),
          created_by: peter.id,
        })
        .select('*')
        .single()
      die(`casting_calls ${casting.title}`, error)
      castingRecord = inserted
    } else {
      await db
        .from('casting_calls')
        .update({ status: 'published', published_at: new Date().toISOString(), deadline_at: deadline })
        .eq('id', castingRecord.id)
    }

    for (const role of casting.roles) {
      const { data: existingRole } = await db
        .from('roles')
        .select('*')
        .eq('casting_call_id', castingRecord.id)
        .eq('name', role.name)
        .maybeSingle()

      if (existingRole) {
        await db.from('roles').update(role).eq('id', existingRole.id)
        roleIds[role.name] = existingRole.id
      } else {
        const { data: inserted, error } = await db
          .from('roles')
          .insert({ casting_call_id: castingRecord.id, ...role })
          .select('*')
          .single()
        die(`roles ${role.name}`, error)
        roleIds[role.name] = inserted.id
      }
    }

    console.log(`✓ project             ${projectRow.title} — ${casting.roles.length} role(s) published`)
  }

  // ── Applications, self-tapes, reviews ──
  const applications = [
    { email: 'maya@letitcast.demo', role: 'Fanny Brice', status: 'submitted', note: 'Two takes as asked — the angrier one is second.' },
    { email: 'camille@letitcast.demo', role: 'Inspectrice Chloé Marchand', status: 'shortlisted', vote: 'good', selftape: true },
    { email: 'sarah@letitcast.demo', role: 'Inspectrice Chloé Marchand', status: 'callback', vote: 'good', selftape: true },
    { email: 'nadia@letitcast.demo', role: 'Inspectrice Chloé Marchand', status: 'under_review', vote: 'maybe', selftape: true },
    { email: 'ines@letitcast.demo', role: 'Inspectrice Chloé Marchand', status: 'submitted', selftape: true },
    { email: 'hannah@letitcast.demo', role: 'Fanny Brice', status: 'viewed', vote: 'maybe', selftape: true },
  ]

  for (const entry of applications) {
    const talentId = talentIds[entry.email]
    const roleId = roleIds[entry.role]
    if (!talentId || !roleId) continue

    // Insert as submitted, then move to the final status: the same path a real
    // application takes, so the notification triggers fire exactly as they will
    // in production (new application to the org, status change to the talent).
    const { data: application, error } = await db
      .from('applications')
      .upsert(
        {
          role_id: roleId,
          talent_id: talentId,
          status: 'submitted',
          note: entry.note ?? null,
          submitted_at: new Date(Date.now() - Math.random() * 5 * 86400000).toISOString(),
          source: 'seed',
        },
        { onConflict: 'role_id,talent_id' },
      )
      .select('*')
      .single()
    die(`applications ${entry.email}`, error)

    if (entry.status !== 'submitted') {
      const { error: statusError } = await db
        .from('applications')
        .update({ status: entry.status, decided_at: new Date().toISOString() })
        .eq('id', application.id)
      die(`application status ${entry.email}`, statusError)
    }

    if (entry.selftape) {
      const person = TALENTS.find((candidate) => candidate.email === entry.email)
      if (person?.selftape) {
        const asset = await uploadAsset(talentId, 'selftape', person.selftape)
        if (asset) {
          await db
            .from('self_tapes')
            .upsert(
              { application_id: application.id, media_asset_id: asset.id },
              { onConflict: 'application_id,media_asset_id' },
            )
        }
      }
    }

    if (entry.vote) {
      await db
        .from('candidate_reviews')
        .upsert(
          { application_id: application.id, reviewer_id: peter.id, vote: entry.vote, comment: null },
          { onConflict: 'application_id,reviewer_id' },
        )
    }
  }
  console.log(`✓ applications        ${applications.length} with self-tapes and votes`)

  // ── One conversation so messaging is not empty ──
  const mayaId = talentIds['maya@letitcast.demo']
  const { data: existingConversation } = await db
    .from('conversations')
    .select('id')
    .eq('context_type', 'role')
    .eq('context_id', roleIds['Fanny Brice'])
    .maybeSingle()

  let conversationId = existingConversation?.id
  if (!conversationId) {
    const { data: conversation, error } = await db
      .from('conversations')
      .insert({
        subject: 'Evermore — Fanny Brice',
        context_type: 'role',
        context_id: roleIds['Fanny Brice'],
        org_id: org.id,
        created_by: peter.id,
      })
      .select('*')
      .single()
    die('conversations', error)
    conversationId = conversation.id

    await db.from('conversation_members').insert([
      { conversation_id: conversationId, profile_id: peter.id },
      { conversation_id: conversationId, profile_id: mayaId },
    ])
    await db.from('messages').insert([
      {
        conversation_id: conversationId,
        sender_id: peter.id,
        body: 'Hi Maya — loved your tape for Fanny. Are you free for a callback next Tuesday?',
      },
    ])
  }
  console.log('✓ conversation        Peter → Maya')

  const { count: notificationCount } = await db
    .from('notifications')
    .select('*', { count: 'exact', head: true })
  console.log(`✓ notifications       ${notificationCount ?? 0} generated by the database triggers`)

  const { data: stats } = await db.from('v_project_stats').select('*')
  console.log('\nProject stats now in the database:')
  for (const row of stats ?? []) {
    console.log(
      `  · roles ${row.roles} · submissions ${row.submissions} · shortlist ${row.shortlist} · callbacks ${row.callbacks}`,
    )
  }

  console.log('\nSign in at the app with:')
  console.log(`  talent      maya@letitcast.demo   / ${PASSWORD}`)
  console.log(`  production  peter@letitcast.demo  / ${PASSWORD}\n`)
}

if (process.argv.includes('reset')) await resetDemo()
await seed()
