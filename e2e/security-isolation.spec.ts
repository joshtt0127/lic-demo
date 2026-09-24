import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Les attaques que l'audit a réussies, rejouées à chaque exécution.
 *
 * Ce fichier n'ouvre pas de navigateur : une protection qui ne tient qu'à un
 * écran n'est pas une protection. Tout se joue en API, avec de vraies sessions
 * et la clé publique — exactement ce dont dispose un attaquant.
 *
 * Trois failles y sont enfermées, toutes reproduites avant correction :
 *   · P0-1 — s'ajouter `owner` à n'importe quelle organisation, puis lire ses
 *     candidatures et télécharger la self-tape d'un autre comédien ;
 *   · P0-2 — se promouvoir de `talent` à `production` ;
 *   · P0-3 — s'ajouter à la conversation d'autrui et lire le fil ;
 *   · P0-4 — se hisser `owner` depuis un rôle `member`.
 *
 * Et les chemins légitimes sont testés à côté : une règle de sécurité qui casse
 * le produit serait remplacée le lendemain.
 */

const env = localEnv()
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Un client authentifié comme un vrai utilisateur, clé publique uniquement. */
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

/** Une production complète : organisation, projet, casting, rôle, candidature, tape. */
async function castingFixture(stamp: number) {
  const ownerEmail = `e2e.sec.owner.${stamp}@letitcast.dev`
  const ownerId = await createAccount(ownerEmail, 'production', 'Olga')

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Secure Films ${stamp}`, slug: `secure-films-${stamp}`, created_by: ownerId, verification_status: 'verified' })
    .select('id')
    .single()
  await admin
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' })

  const { data: project } = await admin
    .from('projects')
    .insert({ org_id: org!.id, created_by: ownerId, title: `Vault ${stamp}` })
    .select('id')
    .single()
  const { data: casting } = await admin
    .from('casting_calls')
    .insert({
      project_id: project!.id,
      created_by: ownerId,
      title: `Vault ${stamp} — open call`,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: role } = await admin
    .from('roles')
    .insert({ casting_call_id: casting!.id, name: `Vera ${stamp}` })
    .select('id')
    .single()

  const insiderEmail = `e2e.sec.insider.${stamp}@letitcast.dev`
  const insiderId = await createAccount(insiderEmail, 'talent', 'Ines')
  const { data: application } = await admin
    .from('applications')
    .insert({
      role_id: role!.id,
      talent_id: insiderId,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  // Une self-tape réelle dans le bucket privé.
  const path = `${insiderId}/${crypto.randomUUID()}.webm`
  await admin.storage
    .from('selftapes')
    .upload(path, new Blob([new Uint8Array(2048)], { type: 'video/webm' }), {
      contentType: 'video/webm',
    })
  const { data: asset } = await admin
    .from('media_assets')
    .insert({
      owner_id: insiderId,
      kind: 'selftape',
      bucket: 'selftapes',
      path,
      mime: 'video/webm',
      bytes: 2048,
    })
    .select('id')
    .single()
  await admin
    .from('self_tapes')
    .insert({ application_id: application!.id, media_asset_id: asset!.id })

  return {
    ownerId,
    ownerEmail,
    orgId: org!.id,
    projectId: project!.id,
    castingId: casting!.id,
    roleId: role!.id,
    insiderId,
    applicationId: application!.id,
    tapePath: path,
  }
}

async function cleanUp(ids: string[], orgId?: string, projectId?: string) {
  if (projectId) await admin.from('projects').delete().eq('id', projectId)
  if (orgId) await admin.from('organizations').delete().eq('id', orgId)
  for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {})
}

test('an outsider cannot join an organization, and cannot reach anything through it', async () => {
  const stamp = Date.now()
  const fixture = await castingFixture(stamp)
  const outsiderEmail = `e2e.sec.outsider.${stamp}@letitcast.dev`
  const outsiderId = await createAccount(outsiderEmail, 'talent', 'Mallory')
  const outsider = await signedIn(outsiderEmail)

  // ── P0-1 : la porte d'entrée ──
  for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
    const { data, error } = await outsider
      .from('organization_members')
      .insert({ org_id: fixture.orgId, profile_id: outsiderId, role, status: 'active' })
      .select('org_id')
    expect(data ?? [], `self-joining as ${role} must be refused`).toHaveLength(0)
    expect(error, `self-joining as ${role} must be refused`).not.toBeNull()
  }
  const { data: memberships } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('profile_id', outsiderId)
  expect(memberships, 'no membership may have been created').toHaveLength(0)

  // ── Ce que la faille ouvrait : rien ne doit être atteignable ──
  const { data: apps } = await outsider.from('applications').select('id').eq('id', fixture.applicationId)
  expect(apps ?? [], "another talent's application").toHaveLength(0)

  const { data: tapes } = await outsider.from('self_tapes').select('id')
  expect(tapes ?? [], 'self-tapes of a casting they are not part of').toHaveLength(0)

  const signed = await outsider.storage.from('selftapes').createSignedUrl(fixture.tapePath, 60)
  expect(signed.data?.signedUrl, 'no signed URL on a private tape').toBeFalsy()
  const download = await outsider.storage.from('selftapes').download(fixture.tapePath)
  expect(download.data, 'no direct download of a private tape').toBeFalsy()

  const { data: notes } = await outsider.from('candidate_notes').select('id')
  expect(notes ?? [], 'internal notes').toHaveLength(0)

  await outsider.auth.signOut()
  await cleanUp([outsiderId, fixture.ownerId, fixture.insiderId], fixture.orgId, fixture.projectId)
})

test('a talent cannot promote themselves to a production account', async () => {
  const stamp = Date.now()
  const email = `e2e.sec.climber.${stamp}@letitcast.dev`
  const id = await createAccount(email, 'talent', 'Cleo')
  const client = await signedIn(email)

  const { data, error } = await client
    .from('profiles')
    .update({ account_type: 'production' })
    .eq('id', id)
    .select('account_type')
  expect(data ?? []).toHaveLength(0)
  expect(error).not.toBeNull()

  const { data: unchanged } = await admin
    .from('profiles')
    .select('account_type')
    .eq('id', id)
    .single()
  expect(unchanged?.account_type, 'the account type survived the attempt').toBe('talent')

  // Le reste du profil reste bien modifiable : la règle vise une colonne, pas l'écran.
  const { error: ownEdit } = await client.from('profiles').update({ city: 'Lyon' }).eq('id', id)
  expect(ownEdit, 'a talent still edits their own profile').toBeNull()

  await client.auth.signOut()
  await cleanUp([id])
})

test('nobody can walk into someone else’s conversation', async () => {
  const stamp = Date.now()
  const fixture = await castingFixture(stamp)
  const intruderEmail = `e2e.sec.intruder.${stamp}@letitcast.dev`
  const intruderId = await createAccount(intruderEmail, 'talent', 'Nina')

  // Une conversation réelle entre la production et sa candidate.
  const { data: conversation } = await admin
    .from('conversations')
    .insert({ context_type: 'direct', created_by: fixture.ownerId })
    .select('id')
    .single()
  await admin.from('conversation_members').insert([
    { conversation_id: conversation!.id, profile_id: fixture.ownerId },
    { conversation_id: conversation!.id, profile_id: fixture.insiderId },
  ])
  await admin.from('messages').insert({
    conversation_id: conversation!.id,
    sender_id: fixture.ownerId,
    body: 'Callback Tuesday, 4pm.',
  })

  const intruder = await signedIn(intruderEmail)
  const { error: joinError } = await intruder
    .from('conversation_members')
    .insert({ conversation_id: conversation!.id, profile_id: intruderId })
  expect(joinError, 'joining a thread you were not invited to').not.toBeNull()

  const { data: stolen } = await intruder
    .from('messages')
    .select('id, body')
    .eq('conversation_id', conversation!.id)
  expect(stolen ?? [], 'private messages stay private').toHaveLength(0)

  await intruder.auth.signOut()
  await admin.from('messages').delete().eq('conversation_id', conversation!.id)
  await admin.from('conversation_members').delete().eq('conversation_id', conversation!.id)
  await admin.from('conversations').delete().eq('id', conversation!.id)
  await cleanUp([intruderId, fixture.ownerId, fixture.insiderId], fixture.orgId, fixture.projectId)
})

test('messaging follows the casting relationship, not the address book', async () => {
  const stamp = Date.now()
  const fixture = await castingFixture(stamp)
  const strangerEmail = `e2e.sec.stranger.${stamp}@letitcast.dev`
  const strangerId = await createAccount(strangerEmail, 'talent', 'Sonia')
  const stranger = await signedIn(strangerEmail)

  /** Ouvre un fil et tente d'y ajouter la cible — ce que fait l'app. */
  async function tryToReach(client: SupabaseClient, me: string, target: string) {
    const { data: conversation } = await client
      .from('conversations')
      .insert({ context_type: 'direct', created_by: me })
      .select('id')
      .single()
    if (!conversation) return { allowed: false, cleanup: async () => {} }
    await client.from('conversation_members').insert({ conversation_id: conversation.id, profile_id: me })
    const { error } = await client
      .from('conversation_members')
      .insert({ conversation_id: conversation.id, profile_id: target })
    return {
      allowed: error === null,
      cleanup: async () => {
        await admin.from('conversation_members').delete().eq('conversation_id', conversation.id)
        await admin.from('conversations').delete().eq('id', conversation.id)
      },
    }
  }

  // Comédien → comédien : jamais.
  const talentToTalent = await tryToReach(stranger, strangerId, fixture.insiderId)
  expect(talentToTalent.allowed, 'a talent cannot cold-message another talent').toBe(false)
  await talentToTalent.cleanup()

  // Comédien → production sans candidature : non.
  const coldToProduction = await tryToReach(stranger, strangerId, fixture.ownerId)
  expect(coldToProduction.allowed, 'no application, no message').toBe(false)
  await coldToProduction.cleanup()
  await stranger.auth.signOut()

  // Comédien qui a candidaté → cette production : oui.
  const insider = await signedIn(`e2e.sec.insider.${stamp}@letitcast.dev`)
  const applicantToProduction = await tryToReach(insider, fixture.insiderId, fixture.ownerId)
  expect(applicantToProduction.allowed, 'an applicant may write to that production').toBe(true)
  await applicantToProduction.cleanup()
  await insider.auth.signOut()

  // Production → comédien de l'annuaire : oui, c'est le métier du casting.
  const production = await signedIn(fixture.ownerEmail)
  const sourcing = await tryToReach(production, fixture.ownerId, strangerId)
  expect(sourcing.allowed, 'a production may reach out to a talent').toBe(true)
  await sourcing.cleanup()
  await production.auth.signOut()

  await cleanUp([strangerId, fixture.ownerId, fixture.insiderId], fixture.orgId, fixture.projectId)
})

test('a member cannot promote themselves inside their own organization', async () => {
  const stamp = Date.now()
  const fixture = await castingFixture(stamp)
  const memberEmail = `e2e.sec.member.${stamp}@letitcast.dev`
  const memberId = await createAccount(memberEmail, 'production', 'Milo')
  await admin
    .from('organization_members')
    .insert({ org_id: fixture.orgId, profile_id: memberId, role: 'member', status: 'active' })

  const member = await signedIn(memberEmail)

  const { data: selfPromotion } = await member
    .from('organization_members')
    .update({ role: 'owner' })
    .eq('org_id', fixture.orgId)
    .eq('profile_id', memberId)
    .select('role')
  expect(selfPromotion ?? [], 'a member cannot grant themselves ownership').toHaveLength(0)

  const { data: stillMember } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', fixture.orgId)
    .eq('profile_id', memberId)
    .single()
  expect(stillMember?.role).toBe('member')

  // Ni décider à la place de la production : le garde de statut tient toujours.
  const { error: decision } = await member
    .from('applications')
    .update({ status: 'cast' })
    .eq('id', fixture.applicationId)
  expect(decision, 'a member may not decide').not.toBeNull()

  await member.auth.signOut()
  await cleanUp([memberId, fixture.ownerId, fixture.insiderId], fixture.orgId, fixture.projectId)
})

test('the legitimate ways in still work: creating an organization, accepting an invite', async () => {
  const stamp = Date.now()
  const founderEmail = `e2e.sec.founder.${stamp}@letitcast.dev`
  const founderId = await createAccount(founderEmail, 'production', 'Farah')
  const founder = await signedIn(founderEmail)

  // Créer son organisation et s'en déclarer propriétaire.
  const { data: org, error: orgError } = await founder
    .from('organizations')
    .insert({ name: `Founder Films ${stamp}`, slug: `founder-films-${stamp}`, created_by: founderId, verification_status: 'verified' })
    .select('id')
    .single()
  expect(orgError).toBeNull()
  const { error: claimError } = await founder
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: founderId, role: 'owner', status: 'active' })
  expect(claimError, 'the creator claims their organization').toBeNull()

  // Une seconde revendication ne passe plus : l'organisation a un propriétaire.
  const squatterEmail = `e2e.sec.squatter.${stamp}@letitcast.dev`
  const squatterId = await createAccount(squatterEmail, 'production', 'Sam')
  const squatter = await signedIn(squatterEmail)
  const { error: squatError } = await squatter
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: squatterId, role: 'owner', status: 'active' })
  expect(squatError, 'an organization is claimed once').not.toBeNull()

  // Invité par un administrateur, il entre — au rôle de l'invitation, pas au sien.
  await admin.from('organization_invites').insert({
    org_id: org!.id,
    email: squatterEmail,
    role: 'member',
    token: `tok-${stamp}`,
    invited_by: founderId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const { error: wrongRole } = await squatter
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: squatterId, role: 'admin', status: 'active' })
  expect(wrongRole, 'the invitation decides the role, not the request').not.toBeNull()

  const { error: accepted } = await squatter
    .from('organization_members')
    .insert({ org_id: org!.id, profile_id: squatterId, role: 'member', status: 'active' })
  expect(accepted, 'an invited member joins').toBeNull()

  await founder.auth.signOut()
  await squatter.auth.signOut()
  await cleanUp([founderId, squatterId], org!.id)
})
