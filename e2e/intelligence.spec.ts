import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Ce que l'architecture d'intelligence promet, vérifié en API.
 *
 * Pas de navigateur ici, pour la même raison qu'ailleurs : une garantie qui ne
 * tient qu'à un écran n'est pas une garantie. Tout se joue avec de vraies
 * sessions et la clé publique — ce dont dispose n'importe qui.
 *
 * Quatre promesses, et ce sont les quatre qu'on casserait sans s'en rendre
 * compte en refactorant :
 *   · la mémoire d'une production ne fuit pas vers une autre ;
 *   · les gestes de revue ne remontent jamais au comédien ;
 *   · aucune candidature n'est masquée — les bandes trient l'attention, pas
 *     l'accès ;
 *   · un inconnu au dossier complet remonte, au lieu d'être enterré sous les
 *     visages familiers.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) throw error
  return client
}

async function createAccount(
  email: string,
  accountType: 'talent' | 'production',
  firstName: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: 'Probe' },
  })
  if (error) throw error
  const id = data.user.id
  await admin
    .from('profiles')
    .update({
      account_type: accountType,
      first_name: firstName,
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (accountType === 'talent') {
    await admin.from('talent_profiles').upsert({ profile_id: id }, { onConflict: 'profile_id' })
  }
  return id
}

async function organization(stamp: number, suffix: string) {
  const email = `e2e.intel.${suffix}.${stamp}@letitcast.dev`
  const ownerId = await createAccount(email, 'production', `Owner${suffix}`)
  const { data: org } = await admin
    .from('organizations')
    .insert({
      name: `Intel ${suffix} ${stamp}`,
      slug: `intel-${suffix}-${stamp}`,
      created_by: ownerId,
      verification_status: 'verified',
    })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' })
  return { ownerId, email, orgId: org!.id }
}

/** Un casting avec un rôle, prêt à recevoir des candidatures. */
async function castingFor(orgId: string, ownerId: string, stamp: number, label: string) {
  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: orgId, created_by: ownerId, title: `${label} ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `${label} ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
      // Loin devant : sinon l'urgence de deadline masquerait ce qu'on teste.
      deadline_at: new Date(Date.now() + 90 * 24 * 3600_000).toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Lead ${label} ${stamp}` })
    .select('id')
    .single()
  return { projectId: project!.id, castingId: casting!.id, roleId: role!.id }
}

/** Une candidature récente, avec sa self-tape : un dossier complet. */
async function applicationWithTape(roleId: string, talentId: string) {
  const { data: application } = await admin
    .from('applications')
    .insert({
      role_id: roleId,
      talent_id: talentId,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const path = `${talentId}/${crypto.randomUUID()}.webm`
  await admin.storage
    .from('selftapes')
    .upload(path, new Blob([new Uint8Array(1024)], { type: 'video/webm' }), {
      contentType: 'video/webm',
    })
  const { data: asset } = await admin
    .from('media_assets')
    .insert({
      owner_id: talentId,
      kind: 'selftape',
      bucket: 'selftapes',
      path,
      mime: 'video/webm',
      bytes: 1024,
    })
    .select('id')
    .single()
  await admin
    .from('self_tapes')
    .insert({ application_id: application!.id, media_asset_id: asset!.id })
  return application!.id
}

test.describe('Intelligence — attention, mémoire et cloisonnement', () => {
  test('le feed range le travail, explique pourquoi, et ne cache personne', async () => {
    const stamp = Date.now()
    const house = await organization(stamp, 'house')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Feed')

    // Une inconnue : dossier complet, jamais ouverte par personne.
    const newcomerId = await createAccount(
      `e2e.intel.newcomer.${stamp}@letitcast.dev`,
      'talent',
      'Nadia',
    )
    const newcomerApp = await applicationWithTape(casting.roleId, newcomerId)

    // Une candidate sur laquelle l'équipe a déjà voté sans conclure.
    const pendingId = await createAccount(
      `e2e.intel.pending.${stamp}@letitcast.dev`,
      'talent',
      'Perrine',
    )
    const pendingApp = await applicationWithTape(casting.roleId, pendingId)
    await admin
      .from('candidate_reviews')
      .insert({ application_id: pendingApp, reviewer_id: house.ownerId, vote: 'good' })

    const owner = await signedIn(house.email)
    const { data: feed, error } = await owner.rpc('intelligence_feed', {
      p_casting: casting.castingId,
    })
    expect(error).toBeNull()

    // Aucune candidature masquée : le feed hiérarchise, il ne filtre pas.
    expect(feed!.map((row: { application_id: string }) => row.application_id).sort()).toEqual(
      [newcomerApp, pendingApp].sort(),
    )

    const pending = feed!.find((row: { application_id: string }) => row.application_id === pendingApp)
    const newcomer = feed!.find(
      (row: { application_id: string }) => row.application_id === newcomerApp,
    )

    // Une équipe qui a voté et n'a pas tranché : c'est ce qui attend une décision.
    expect(pending.band).toBe('priority')
    expect(pending.reasons.map((reason: { code: string }) => reason.code)).toContain('team_waiting')

    // L'inconnue remonte par construction, et l'explication le dit.
    expect(newcomer.band).toBe('discovery')
    expect(newcomer.reasons.map((reason: { code: string }) => reason.code)).toContain('new_to_you')

    // Chaque ligne porte la version du moteur qui l'a produite : sans elle, une
    // équipe ne peut pas dire de quoi elle conteste le résultat.
    for (const row of feed!) expect(row.engine_version).toBeTruthy()
  })

  test('la mémoire d’une production ne fuit pas vers une autre', async () => {
    const stamp = Date.now() + 1
    const mine = await organization(stamp, 'mine')
    const rival = await organization(stamp, 'rival')
    const casting = await castingFor(mine.orgId, mine.ownerId, stamp, 'Private')

    const talentId = await createAccount(
      `e2e.intel.shared.${stamp}@letitcast.dev`,
      'talent',
      'Sasha',
    )
    const applicationId = await applicationWithTape(casting.roleId, talentId)
    await admin.from('applications').update({ status: 'shortlisted' }).eq('id', applicationId)

    const insider = await signedIn(mine.email)
    const { data: own } = await insider
      .from('v_talent_memory')
      .select('*')
      .eq('talent_id', talentId)
      .eq('org_id', mine.orgId)
    expect(own!.length).toBe(1)
    expect(own![0].shortlisted).toBe(1)

    // La concurrente demande exactement la même chose, nommément.
    const outsider = await signedIn(rival.email)
    const { data: stolen } = await outsider
      .from('v_talent_memory')
      .select('*')
      .eq('talent_id', talentId)
      .eq('org_id', mine.orgId)
    expect(stolen ?? []).toEqual([])

    // Et son feed sur un casting qui n'est pas le sien ne renvoie rien.
    const { data: foreignFeed } = await outsider.rpc('intelligence_feed', {
      p_casting: casting.castingId,
    })
    expect(foreignFeed ?? []).toEqual([])
  })

  test('les gestes de revue ne remontent jamais au comédien', async () => {
    const stamp = Date.now() + 2
    const house = await organization(stamp, 'watch')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Watched')
    const talentEmail = `e2e.intel.watched.${stamp}@letitcast.dev`
    const talentId = await createAccount(talentEmail, 'talent', 'Théo')
    const applicationId = await applicationWithTape(casting.roleId, talentId)

    const owner = await signedIn(house.email)
    for (const kind of ['AUDITION_OPENED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED']) {
      const { error } = await owner.rpc('record_review_engagement', {
        p_application: applicationId,
        p_kind: kind,
        p_progress: kind === 'AUDITION_COMPLETED' ? 0.95 : null,
      })
      expect(error).toBeNull()
    }

    // La production, elle, voit son propre travail.
    const { data: seenByOrg } = await owner
      .from('events')
      .select('type')
      .eq('entity_id', applicationId)
      .in('type', ['AUDITION_OPENED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED'])
    expect(seenByOrg!.length).toBe(3)

    // Le comédien ne voit rien de la délibération, ni dans la table…
    const talent = await signedIn(talentEmail)
    const { data: seenByTalent } = await talent
      .from('events')
      .select('type')
      .eq('subject_id', talentId)
      .in('type', ['AUDITION_OPENED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED'])
    expect(seenByTalent ?? []).toEqual([])

    // …ni dans son export RGPD, qui passe pourtant en `security definer`.
    const { data: exported } = await talent.rpc('export_my_data')
    const types = ((exported as { events_about_me: { type: string }[] }).events_about_me ?? []).map(
      (event) => event.type,
    )
    expect(types).not.toContain('AUDITION_OPENED')
    expect(types).not.toContain('AUDITION_REWATCHED')

    // Et il ne peut pas non plus en fabriquer sur son propre dossier.
    const { error: forged } = await talent.rpc('record_review_engagement', {
      p_application: applicationId,
      p_kind: 'AUDITION_COMPLETED',
      p_progress: 1,
    })
    expect(forged).not.toBeNull()
  })

  test('une production ne peut pas noter l’attention d’une candidature qui n’est pas la sienne', async () => {
    const stamp = Date.now() + 3
    const house = await organization(stamp, 'owner2')
    const rival = await organization(stamp, 'rival2')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Guarded')
    const talentId = await createAccount(
      `e2e.intel.guarded.${stamp}@letitcast.dev`,
      'talent',
      'Gaby',
    )
    const applicationId = await applicationWithTape(casting.roleId, talentId)

    const outsider = await signedIn(rival.email)
    const { error } = await outsider.rpc('record_review_engagement', {
      p_application: applicationId,
      p_kind: 'AUDITION_OPENED',
      p_progress: null,
    })
    // Sans ce garde, n'importe qui pourrait fabriquer de l'attention — et de
    // l'attention fabriquée empoisonne la mémoire de tout le monde.
    expect(error).not.toBeNull()
  })
})

test.describe('Talent Graph™ — la trajectoire inter-productions', () => {
  test('compte les productions distinctes, sans jamais dire lesquelles', async () => {
    const stamp = Date.now() + 10
    // Trois maisons de production indépendantes, qui ne se connaissent pas.
    const houses = [
      await organization(stamp, 'g1'),
      await organization(stamp, 'g2'),
      await organization(stamp, 'g3'),
    ]

    const talentEmail = `e2e.graph.talent.${stamp}@letitcast.dev`
    const talentId = await createAccount(talentEmail, 'talent', 'Camille')

    // Le scénario du mémo : trois auditions, deux callbacks indépendants.
    const outcomes = ['callback', 'callback', 'not_selected'] as const
    for (const [index, house] of houses.entries()) {
      const casting = await castingFor(house.orgId, house.ownerId, stamp + index, `Graph${index}`)
      const applicationId = await applicationWithTape(casting.roleId, talentId)
      await admin
        .from('applications')
        .update({ status: outcomes[index], decided_at: new Date().toISOString() })
        .eq('id', applicationId)
    }

    const viewer = await signedIn(houses[0].email)
    const { data, error } = await viewer.rpc('talent_graph', { p_talents: [talentId] })
    expect(error).toBeNull()
    expect(data!.length).toBe(1)

    const graph = data![0]
    expect(graph.productions_applied).toBe(3)
    expect(graph.productions_callback).toBe(2)
    expect(graph.productions_shortlisted).toBe(2)
    expect(graph.productions_cast).toBe(0)
    expect(graph.auditions_total).toBe(3)

    // La trajectoire est datée : c'est ce qui l'empêche de figer quelqu'un.
    expect(graph.by_year.length).toBeGreaterThan(0)
    expect(graph.by_year[0]).toHaveProperty('year')

    // **L'identité des autres productions ne sort jamais.** Un compte est une
    // information de casting ; savoir lesquelles est une information
    // concurrentielle, et elle ne nous appartient pas.
    const payload = JSON.stringify(graph)
    for (const house of houses) {
      expect(payload).not.toContain(house.orgId)
      expect(payload).not.toContain(house.ownerId)
    }

    // Et aucun agrégat pondéré : que des comptes entiers, rien sur 100.
    for (const [key, value] of Object.entries(graph)) {
      if (typeof value !== 'number') continue
      expect(Number.isInteger(value), `${key} doit rester un compte, pas un score`).toBe(true)
    }
  })

  test('le comédien ne voit pas sa propre trajectoire', async () => {
    const stamp = Date.now() + 11
    const house = await organization(stamp, 'g4')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Hidden')
    const talentEmail = `e2e.graph.hidden.${stamp}@letitcast.dev`
    const talentId = await createAccount(talentEmail, 'talent', 'Hugo')
    await applicationWithTape(casting.roleId, talentId)

    // « 0 production ne vous a rappelé » se lirait comme un verdict de carrière
    // là où il n'y a qu'un compteur. Le graphe est fermé aux comédiens.
    const talent = await signedIn(talentEmail)
    const { data } = await talent.rpc('talent_graph', { p_talents: [talentId] })
    expect(data ?? []).toEqual([])
  })
})

test.describe('Intelligence Feed™ v2 — mémoire × contexte × découverte', () => {
  test('un inconnu recommandé ailleurs remonte, avec le fait qui le dit', async () => {
    const stamp = Date.now() + 20
    const elsewhere = await organization(stamp, 'v2elsewhere')
    const mine = await organization(stamp, 'v2mine')

    const talentEmail = `e2e.v2.known.${stamp}@letitcast.dev`
    const talentId = await createAccount(talentEmail, 'talent', 'Victor')

    // Une autre maison l'a casté. La mienne ne l'a jamais vu.
    const past = await castingFor(elsewhere.orgId, elsewhere.ownerId, stamp, 'Past')
    const pastApp = await applicationWithTape(past.roleId, talentId)
    await admin
      .from('applications')
      .update({ status: 'cast', decided_at: new Date().toISOString() })
      .eq('id', pastApp)

    const mineCasting = await castingFor(mine.orgId, mine.ownerId, stamp, 'Mine')
    const freshApp = await applicationWithTape(mineCasting.roleId, talentId)

    const owner = await signedIn(mine.email)
    const { data: feed, error } = await owner.rpc('intelligence_feed', {
      p_casting: mineCasting.castingId,
    })
    expect(error).toBeNull()

    const row = feed!.find((r: { application_id: string }) => r.application_id === freshApp)
    expect(row.band).toBe('discovery')
    const codes = row.reasons.map((reason: { code: string }) => reason.code)
    expect(codes).toContain('new_to_you')
    expect(codes).toContain('cast_elsewhere')

    // Un compte de productions, jamais leur identité.
    const peer = row.reasons.find((r: { code: string }) => r.code === 'cast_elsewhere')
    expect(peer.productions).toBe(1)
    expect(JSON.stringify(row)).not.toContain(elsewhere.orgId)
  })

  test('dans Discovery, un dossier exploitable passe devant un dossier vide', async () => {
    const stamp = Date.now() + 21
    const house = await organization(stamp, 'v2order')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Order')

    // La candidature complète est la PLUS RÉCENTE : sans le Discovery Signal,
    // l'ancienneté la ferait passer en second. C'est exactement ce que le §9
    // corrige — « voici les inconnus qui méritent vos dix prochaines minutes »
    // plutôt que « voici les inconnus, par ordre d'arrivée ».
    const barelyId = await createAccount(`e2e.v2.bare.${stamp}@letitcast.dev`, 'talent', 'Bruno')
    const { data: bare } = await admin
      .from('applications')
      .insert({
        role_id: casting.roleId,
        talent_id: barelyId,
        status: 'submitted',
        submitted_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        note: 'Bonjour, je suis très intéressé par ce rôle et disponible.',
      })
      .select('id')
      .single()
    await admin.from('applications').update({ headshot_id: null }).eq('id', bare!.id)

    const readyId = await createAccount(`e2e.v2.ready.${stamp}@letitcast.dev`, 'talent', 'Rita')
    const readyApp = await applicationWithTape(casting.roleId, readyId)

    const owner = await signedIn(house.email)
    const { data: feed } = await owner.rpc('intelligence_feed', {
      p_casting: casting.castingId,
    })

    const discovery = feed!
      .filter((r: { band: string }) => r.band === 'discovery')
      .sort((a: { queue_rank: number }, b: { queue_rank: number }) => a.queue_rank - b.queue_rank)

    expect(discovery.length).toBeGreaterThan(0)
    expect(discovery[0].application_id).toBe(readyApp)
    expect(discovery[0].readiness).toBe('ready')

    // Et le dossier est décrit par des vérifications nommées, pas par une note.
    const checks = discovery[0].checks as { code: string; ok: boolean | null }[]
    expect(checks.find((check) => check.code === 'self_tape')?.ok).toBe(true)
    for (const check of checks) {
      expect([true, false, null]).toContain(check.ok)
    }
  })

  test('le dossier est jugé, jamais la personne', async () => {
    const stamp = Date.now() + 22
    const house = await organization(stamp, 'v2thin')
    const casting = await castingFor(house.orgId, house.ownerId, stamp, 'Thin')
    const talentId = await createAccount(`e2e.v2.thin.${stamp}@letitcast.dev`, 'talent', 'Théa')
    const { data: empty } = await admin
      .from('applications')
      .insert({
        role_id: casting.roleId,
        talent_id: talentId,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    const owner = await signedIn(house.email)
    const { data: signal } = await owner.rpc('discovery_signal', {
      p_casting: casting.castingId,
    })
    const row = signal!.find((r: { application_id: string }) => r.application_id === empty!.id)

    // Rien envoyé : le dossier est vide. Ça ne dit rien du comédien, et le
    // vocabulaire de sortie ne doit rien laisser croire d'autre.
    expect(row.readiness).toBe('thin')
    expect(['ready', 'partial', 'thin']).toContain(row.readiness)

    // Une vérification non applicable ne pénalise jamais : elle reste `null` et
    // sort du dénominateur — même règle que le contrôle technique des tapes.
    expect(row.applicable).toBeLessThanOrEqual(8)
    expect(row.met).toBeLessThanOrEqual(row.applicable)
  })
})

test.describe('Ce qui est vrai pour tout le monde ne classe personne', () => {
  test('une échéance proche n’envoie pas tout le casting en Priority', async () => {
    const stamp = Date.now() + 30
    const house = await organization(stamp, 'dl')

    const { data: project } = await admin
      .from('projects')
      .insert({ org_id: house.orgId, created_by: house.ownerId, title: `Deadline ${stamp}` })
      .select('id')
      .single()
    // L'échéance est dans 12 heures : elle concerne donc **toutes** les
    // candidatures, exactement de la même façon.
    const { data: casting } = await admin
      .from('casting_calls')
      .insert({
        project_id: project!.id,
        created_by: house.ownerId,
        title: `Deadline ${stamp} — open call`,
        status: 'published',
        published_at: new Date().toISOString(),
        deadline_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      })
      .select('id')
      .single()
    const { data: role } = await admin
      .from('roles')
      .insert({ casting_call_id: casting!.id, name: `Lead ${stamp}` })
      .select('id')
      .single()

    // Trois inconnus au dossier complet, arrivés à l'instant : rien ne les
    // distingue les uns des autres, et rien ne demande encore de décision.
    for (let i = 0; i < 3; i += 1) {
      const talentId = await createAccount(
        `e2e.dl.${i}.${stamp}@letitcast.dev`,
        'talent',
        `Dana${i}`,
      )
      await applicationWithTape(role!.id, talentId)
    }

    const owner = await signedIn(house.email)
    const { data: feed } = await owner.rpc('intelligence_feed', { p_casting: casting!.id })

    /**
     * Le cœur de la règle : un signal identique pour toutes les lignes ne peut
     * pas les départager. Une échéance appartient au casting, pas à la
     * candidature — en faire un motif de bande promouvait tout le monde au
     * moment précis où trier compte le plus, et le produit finissait par dire
     * « tout est prioritaire », ce qui est une autre façon de dire « je ne sais
     * pas ».
     */
    const priority = feed!.filter((row: { band: string }) => row.band === 'priority')
    expect(priority.length).toBe(0)

    const discovery = feed!.filter((row: { band: string }) => row.band === 'discovery')
    expect(discovery.length).toBe(3)

    // L'échéance reste dite — elle est vraie et l'équipe doit la lire — et elle
    // garde tout son poids dans l'ordre à l'intérieur de la bande.
    for (const row of discovery) {
      expect(row.reasons.map((r: { code: string }) => r.code)).toContain('deadline_close')
    }
  })
})
