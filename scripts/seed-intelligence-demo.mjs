/**
 * Un casting peuplé, pour voir Intelligence Live travailler.
 *
 *   node scripts/seed-intelligence-demo.mjs <org_id>          crée
 *   node scripts/seed-intelligence-demo.mjs <org_id> --clean  retire tout
 *
 * Le moteur est exact, mais il ne peut rien montrer sur un casting vide : pas
 * de bande Priority sans décision en attente, pas de Discovery sans inconnu,
 * pas de trajectoire sans passé. Ce script fabrique donc **les candidatures**,
 * pas les conclusions : ce que le Feed en fera ensuite est calculé par le vrai
 * moteur, sur ces vraies lignes.
 *
 * Ce qui est fabriqué, et ce qui ne l'est pas :
 *   · fabriqué — des comptes comédiens, leurs profils, leurs candidatures,
 *     quelques votes d'équipe et quelques gestes de revue ;
 *   · pas fabriqué — les bandes, les raisons, les durées, les trajectoires.
 *     Tout ça est recalculé par `intelligence_feed`, `discovery_signal` et
 *     `talent_graph` à partir des lignes ci-dessous.
 *
 * Les comptes créés portent tous le préfixe `demo.il.` et se retirent d'un
 * `--clean`. Aucune donnée réelle n'est touchée.
 *
 * ⚠️ Les self-tapes pointent vers un fichier de démonstration **déjà présent**
 * dans le stockage plutôt que d'en téléverser un par candidature. C'est un
 * choix assumé : dupliquer huit vidéos ajouterait ~40 Mo au projet pour une
 * démonstration, et le quota Supabase a déjà coûté cher. Les vidéos se lisent
 * donc réellement, mais plusieurs candidatures montrent la même prise.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const ORG = process.argv[2]
const CLEAN = process.argv.includes('--clean')
if (!ORG) {
  console.error('usage: node scripts/seed-intelligence-demo.mjs <org_id> [--clean]')
  process.exit(1)
}

const PREFIX = 'demo.il.'
const DOMAIN = '@letitcast.dev'
const PASSWORD = env.DEMO_PASSWORD || 'LetItCast2026!'
const hours = (n) => new Date(Date.now() - n * 3600_000).toISOString()

// ── Nettoyage ──────────────────────────────────────────────────────────────

if (CLEAN) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const mine = (data?.users ?? []).filter((u) => u.email?.startsWith(PREFIX))
  for (const user of mine) await admin.auth.admin.deleteUser(user.id)
  console.log(`retiré ${mine.length} compte(s) de démonstration`)
  process.exit(0)
}

// ── Le casting reçoit les candidatures ─────────────────────────────────────

const { data: castings } = await admin
  .from('casting_calls')
  .select('id, title, project_id, created_by, projects!inner(org_id)')
  .eq('projects.org_id', ORG)
  .limit(1)

/**
 * Pas de casting ? On en crée un.
 *
 * Une organisation toute neuve n'a rien à peupler, et exiger qu'elle ait déjà
 * publié un casting rendait le script inutile là où il sert le plus : montrer
 * le produit à quelqu'un qui vient d'ouvrir son compte.
 */
let casting = castings?.[0]
if (!casting) {
  const { data: owner } = await admin
    .from('organization_members')
    .select('profile_id')
    .eq('org_id', ORG)
    .eq('status', 'active')
    .limit(1)
    .single()

  const { data: project } = await admin
    .from('projects')
    .insert({
      org_id: ORG,
      created_by: owner?.profile_id ?? null,
      title: 'La Ligne de fuite',
      production_type: 'film',
      synopsis:
        "Un huis clos de deux heures dans un train de nuit. Trois personnages, une frontière, et tout ce qu'ils ne se disent pas.",
    })
    .select('id, created_by')
    .single()

  const { data: made } = await admin
    .from('casting_calls')
    .insert({
      project_id: project.id,
      created_by: project.created_by,
      title: 'La Ligne de fuite — rôle principal',
      status: 'published',
      location: 'Paris',
    })
    .select('id, title')
    .single()

  await admin.from('roles').insert({ casting_call_id: made.id, name: 'Sacha', role_type: 'lead' })
  casting = made
  console.log(`casting créé : « ${made.title} »`)
}

// Publié et avec une échéance proche : sans deadline, le moteur ne peut pas
// produire la raison « the deadline is in … », qui est l'une des plus parlantes.
await admin
  .from('casting_calls')
  .update({
    status: 'published',
    published_at: hours(24 * 14),
    deadline_at: new Date(Date.now() + 40 * 3600_000).toISOString(),
  })
  .eq('id', casting.id)

const { data: roles } = await admin.from('roles').select('id, name').eq('casting_call_id', casting.id)
const role = roles?.[0]

// Des critères déclarés, sinon le Discovery Signal n'a rien à vérifier : sans
// fourchette d'âge ni langue annoncée, « âge compatible » reste `null` et sort
// du dénominateur.
await admin
  .from('roles')
  .update({
    playing_age_min: 25,
    playing_age_max: 42,
    languages: ['fr', 'en'],
    description:
      "Rôle principal. Un personnage tendu, drôle malgré lui, qui encaisse. On cherche une présence sobre, une voix posée, et la capacité de tenir un silence.",
    selftape_instructions:
      "Scène 4, deux prises. Plan poitrine, lumière de face, son direct. Annoncez votre nom avant la première prise.",
  })
  .eq('id', role.id)

// ── Les comédiens ──────────────────────────────────────────────────────────

/**
 * Chaque ligne décrit une situation de casting réelle, pas un rang.
 *
 * `status` est l'état de la candidature, `waited` son ancienneté en heures,
 * `tape` la présence d'une prise, `note` le mot d'intention. Le reste — la
 * bande, l'ordre, les raisons — est déduit par le moteur.
 */
const CAST = [
  // Des inconnues au dossier complet : la bande Discovery.
  { first: 'Nour', last: 'Benali', age: [28, 36], langs: ['fr', 'en'], status: 'submitted', waited: 3, tape: true, note: "La scène 4 m'a happée. J'ai tourné deux prises, la seconde plus retenue." },
  { first: 'Elias', last: 'Moreau', age: [30, 40], langs: ['fr'], status: 'submitted', waited: 9, tape: true, note: "Silence tenu sur la fin, comme demandé. Son direct, lumière de face." },
  { first: 'Ivy', last: 'Castellane', age: [26, 34], langs: ['fr', 'en'], status: 'submitted', waited: 21, tape: true, note: "Deux prises, plan poitrine. Disponible sur toute la période." },
  // Dossiers incomplets : ce que le Discovery Signal distingue sans juger.
  { first: 'Malik', last: 'Sow', age: [29, 38], langs: ['fr'], status: 'submitted', waited: 30, tape: false, note: "Très intéressé par ce rôle, je tourne la tape ce week-end." },
  { first: 'Théa', last: 'Roux', age: [24, 31], langs: ['fr'], status: 'submitted', waited: 44, tape: false, note: null },
  // L'équipe s'est engagée et n'a pas conclu : la bande Priority.
  { first: 'Camille', last: 'Daurat', age: [31, 41], langs: ['fr', 'en'], status: 'shortlisted', waited: 96, tape: true, note: "Merci pour le retour, je reste disponible." },
  { first: 'Jonas', last: 'Weill', age: [33, 43], langs: ['fr', 'en'], status: 'shortlisted', waited: 132, tape: true, note: "Prise 2 plus sobre, comme vous l'aviez suggéré." },
  { first: 'Salomé', last: 'Vence', age: [27, 35], langs: ['fr'], status: 'callback', waited: 180, tape: true, note: "Disponible pour le callback, en visio ou sur place." },
  // Vues, jamais tranchées : l'attente devient elle-même un signal.
  { first: 'Rémi', last: 'Achard', age: [28, 37], langs: ['fr'], status: 'viewed', waited: 250, tape: true, note: "Au plaisir d'échanger." },
  { first: 'Lou', last: 'Perrin', age: [25, 33], langs: ['fr', 'en'], status: 'viewed', waited: 300, tape: true, note: null },
  // Deux comédiennes qu'une autre production a déjà retenues : le Talent Graph.
  { first: 'Anaïs', last: 'Kerouac', age: [30, 39], langs: ['fr', 'en'], status: 'submitted', waited: 6, tape: true, note: "Je viens de terminer un tournage, je suis libre à partir du 15.", elsewhere: 'cast' },
  { first: 'Victor', last: 'Lasserre', age: [32, 42], langs: ['fr', 'en'], status: 'submitted', waited: 14, tape: true, note: "Deux prises envoyées, la seconde au plus proche du texte.", elsewhere: 'callback' },
]

const { data: tape } = await admin
  .from('media_assets')
  .select('id, bucket, path, mime, bytes')
  .eq('kind', 'selftape')
  .order('bytes', { ascending: true })
  .limit(1)
  .single()

// Une autre maison de production, pour que la trajectoire inter-productions
// ait un « ailleurs » réel à raconter.
const { data: otherRole } = await admin
  .from('roles')
  .select('id, casting_calls!inner(casting_call_id:id, projects!inner(org_id))')
  .neq('casting_calls.projects.org_id', ORG)
  .limit(1)
  .single()

let created = 0
for (const [index, person] of CAST.entries()) {
  const email = `${PREFIX}${index}.${person.first.toLowerCase().replace(/[^a-z]/g, '')}${DOMAIN}`

  /**
   * Un comédien déjà créé est **réutilisé**, pas sauté.
   *
   * Le script les ignorait, et peupler un second casting ne produisait alors
   * aucune candidature. C'est aussi plus juste : les mêmes comédiens qui
   * postulent chez plusieurs productions, c'est précisément ce qui donne au
   * Talent Graph une trajectoire à raconter — « rappelé par deux autres
   * équipes » n'existe pas autrement.
   */
  const { data: made, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: person.first, last_name: person.last },
  })

  let talentId = made?.user?.id
  if (error || !talentId) {
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('first_name', person.first)
      .eq('last_name', person.last)
      .limit(1)
      .maybeSingle()
    if (!existing) {
      console.log(`  ✖ ${person.first} : ${error?.message ?? 'introuvable'}`)
      continue
    }
    talentId = existing.id
  }

  await admin
    .from('profiles')
    .update({
      account_type: 'talent',
      first_name: person.first,
      last_name: person.last,
      city: 'Paris',
      country: 'France',
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', talentId)

  await admin.from('talent_profiles').upsert(
    {
      profile_id: talentId,
      professional_name: `${person.first} ${person.last}`,
      headline: 'Comédien·ne',
      playing_age_min: person.age[0],
      playing_age_max: person.age[1],
      experience_level: index % 3 === 0 ? 'Established' : 'Emerging',
    },
    { onConflict: 'profile_id' },
  )

  for (const language of person.langs) {
    await admin.from('talent_languages').upsert(
      { talent_id: talentId, language, fluency: 'native' },
      { onConflict: 'talent_id,language' },
    )
  }

  // La candidature, datée pour que l'attente veuille dire quelque chose.
  const submittedAt = hours(person.waited)
  const { data: application, error: applied } = await admin
    .from('applications')
    .upsert(
      {
        role_id: role.id,
        talent_id: talentId,
        status: person.status,
        note: person.note,
        submitted_at: submittedAt,
        created_at: submittedAt,
      },
      { onConflict: 'role_id,talent_id' },
    )
    .select('id')
    .single()
  if (applied || !application) {
    console.log(`  ✖ ${person.first} : ${applied?.message ?? 'candidature refusée'}`)
    continue
  }

  if (person.tape) {
    /**
     * Toutes les candidatures pointent vers **le même** fichier existant.
     *
     * `media_assets` impose `unique (bucket, path)` : impossible de créer une
     * ligne par comédien sur le même objet de stockage, et téléverser huit
     * vidéos ajouterait ~40 Mo pour une démonstration — le quota Supabase a
     * déjà coûté cher une fois. Les tapes se lisent donc réellement, mais
     * plusieurs candidatures montrent la même prise. C'est visible, c'est
     * assumé, et ça ne change rien à ce que le moteur calcule : il regarde
     * l'existence de la tape et son contrôle technique, pas son contenu.
     */
    const { data: already } = await admin
      .from('self_tapes')
      .select('id')
      .eq('application_id', application.id)
      .limit(1)
      .maybeSingle()
    const { data: selfTape } = already
      ? { data: already }
      : await admin
          .from('self_tapes')
          .insert({
            application_id: application.id,
            media_asset_id: tape.id,
            submitted_at: submittedAt,
          })
          .select('id')
          .single()
    // Un contrôle technique réel : c'est lui que lit « techniquement
    // exploitable » dans le Discovery Signal.
    await admin.from('tape_checks').upsert({
      self_tape_id: selfTape.id,
      duration_s: 62,
      width: 1080,
      height: 1920,
      framing: 'portrait',
      brightness: 0.52,
      has_audio: true,
      bytes: tape.bytes,
      checks: {},
      score: index % 5 === 0 ? 58 : 84,
    })
  }

  // Une histoire ailleurs, chez une autre production.
  if (person.elsewhere && otherRole) {
    await admin.from('applications').insert({
      role_id: otherRole.id,
      talent_id: talentId,
      status: person.elsewhere === 'cast' ? 'cast' : 'callback',
      submitted_at: hours(24 * 120),
      created_at: hours(24 * 120),
      decided_at: hours(24 * 100),
    })
  }

  created += 1
  console.log(`  ✓ ${person.first} ${person.last} — ${person.status}${person.tape ? ' + tape' : ''}`)
}

// ── Ce que l'équipe a déjà fait : votes et gestes de revue ────────────────

const { data: members } = await admin
  .from('organization_members')
  .select('profile_id')
  .eq('org_id', ORG)
  .eq('status', 'active')
const reviewer = members?.[0]?.profile_id

const { data: shortlisted } = await admin
  .from('applications')
  .select('id, talent_id')
  .eq('role_id', role.id)
  .in('status', ['shortlisted', 'callback'])

if (reviewer) {
  for (const application of shortlisted ?? []) {
    // Un vote sans décision derrière : c'est ce qui fait remonter « a teammate
    // voted and nobody has decided ».
    await admin.from('candidate_reviews').upsert(
      { application_id: application.id, reviewer_id: reviewer, vote: 'good', comment: 'Belle présence, à revoir.' },
      { onConflict: 'application_id,reviewer_id' },
    )
    // Et l'attention réellement dépensée : ouverte, regardée en entier, revue.
    for (const type of ['AUDITION_OPENED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED']) {
      await admin.from('events').insert({
        type,
        actor_id: reviewer,
        entity_type: 'application',
        entity_id: application.id,
        subject_id: application.talent_id,
        source: 'seed',
      })
    }
  }
}

console.log(`\n${created} comédien·ne(s) ajouté·e(s) au casting « ${casting.title} ».`)
console.log('Les bandes, les raisons et les durées sont calculées par le moteur, pas écrites ici.')
