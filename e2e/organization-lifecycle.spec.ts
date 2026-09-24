import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv } from './env'

/**
 * Ce qui arrive à une organisation quand les gens vont et viennent.
 *
 * La Phase 1 a interdit au dernier propriétaire de partir. C'était juste, mais
 * ça enfermait tout le monde tant qu'aucun parcours ne permettait de
 * transmettre. Ce test vérifie les deux bouts : on ne part pas en laissant une
 * organisation sans propriétaire, et on peut transmettre pour partir.
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

async function makeProduction(email: string, firstName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: 'Org' },
  })
  if (error) throw error
  await admin
    .from('profiles')
    .update({
      account_type: 'production',
      first_name: firstName,
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', data.user.id)
  return data.user.id
}

test('an organization changes hands without ever losing its owner', async () => {
  const stamp = Date.now()
  const ownerEmail = `e2e.life.owner.${stamp}@letitcast.dev`
  const adminEmail = `e2e.life.admin.${stamp}@letitcast.dev`
  const memberEmail = `e2e.life.member.${stamp}@letitcast.dev`

  const ownerId = await makeProduction(ownerEmail, 'Ola')
  const adminId = await makeProduction(adminEmail, 'Adam')
  const memberId = await makeProduction(memberEmail, 'Mia')

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: `Relay Films ${stamp}`, slug: `relay-films-${stamp}`, created_by: ownerId })
    .select('id')
    .single()
  await admin.from('organization_members').insert([
    { org_id: org!.id, profile_id: ownerId, role: 'owner', status: 'active' },
    { org_id: org!.id, profile_id: adminId, role: 'admin', status: 'active' },
    { org_id: org!.id, profile_id: memberId, role: 'member', status: 'active' },
  ])

  const owner = await signedIn(ownerEmail)
  const orgAdmin = await signedIn(adminEmail)
  const member = await signedIn(memberEmail)

  // ── Un admin n'est pas un propriétaire ──
  const { error: adminTransfer } = await orgAdmin.rpc('transfer_organization_ownership', {
    p_org: org!.id,
    p_to: adminId,
  })
  expect(adminTransfer, 'an admin cannot hand the organization to themselves').not.toBeNull()

  const { data: demoted } = await orgAdmin
    .from('organization_members')
    .update({ role: 'member' })
    .eq('org_id', org!.id)
    .eq('profile_id', ownerId)
    .select('role')
  expect(demoted ?? [], 'an admin cannot demote the owner').toHaveLength(0)

  // ── Le propriétaire ne peut pas partir tant qu'il est seul propriétaire ──
  const { error: escape } = await owner
    .from('organization_members')
    .delete()
    .eq('org_id', org!.id)
    .eq('profile_id', ownerId)
  expect(escape, 'the last owner cannot walk out').not.toBeNull()

  // ── Un membre, lui, part quand il veut ──
  const { error: memberLeaves } = await member
    .from('organization_members')
    .delete()
    .eq('org_id', org!.id)
    .eq('profile_id', memberId)
  expect(memberLeaves, 'a member may leave').toBeNull()
  const { data: gone } = await admin
    .from('organization_members')
    .select('profile_id')
    .eq('org_id', org!.id)
    .eq('profile_id', memberId)
  expect(gone ?? []).toHaveLength(0)

  // ── La transmission : une opération, jamais deux propriétaires ni zéro ──
  const { error: handOver } = await owner.rpc('transfer_organization_ownership', {
    p_org: org!.id,
    p_to: adminId,
  })
  expect(handOver, 'the owner hands over').toBeNull()

  const { data: roles } = await admin
    .from('organization_members')
    .select('profile_id, role')
    .eq('org_id', org!.id)
  const byId = Object.fromEntries((roles ?? []).map((row) => [row.profile_id, row.role]))
  expect(byId[adminId], 'the new owner').toBe('owner')
  expect(byId[ownerId], 'the former owner stays, as an admin').toBe('admin')
  expect((roles ?? []).filter((row) => row.role === 'owner')).toHaveLength(1)

  // ── Et maintenant l'ancien propriétaire peut partir ──
  const { error: nowLeaves } = await owner
    .from('organization_members')
    .delete()
    .eq('org_id', org!.id)
    .eq('profile_id', ownerId)
  expect(nowLeaves, 'once handed over, the former owner may leave').toBeNull()

  await owner.auth.signOut()
  await orgAdmin.auth.signOut()
  await member.auth.signOut()
  await admin.from('organizations').delete().eq('id', org!.id)
  for (const id of [ownerId, adminId, memberId]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})
