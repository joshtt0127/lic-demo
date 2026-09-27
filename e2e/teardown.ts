import { createClient } from '@supabase/supabase-js'
import { localEnv } from './env'

/**
 * Removes what the specs created, so the project keeps only the seed.
 *
 * Deleting the accounts is not enough: a spec that fails before its own cleanup
 * leaves its organization behind, and `organizations.created_by` is only set to
 * null when the account goes. Those orphans then show up as castings in the
 * demo feed — which is exactly the kind of invented data this POC refuses.
 * Anything whose owner is gone and that has no active member is swept here;
 * projects, castings, roles and applications cascade from the organization.
 */
export default async function teardown() {
  const env = localEnv()
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const created = (data?.users ?? []).filter(
    (user) => user.email?.startsWith('e2e.') && user.email.endsWith('@letitcast.dev'),
  )
  for (const user of created) {
    await admin.auth.admin.deleteUser(user.id)
  }
  // Now that the accounts are gone, sweep the organizations they left behind.
  const { data: orphans } = await admin
    .from('organizations')
    .select('id, name, created_by, organization_members ( profile_id )')
    .is('created_by', null)

  type OrphanJoin = { id: string; name: string; organization_members: { profile_id: string }[] | null }
  let removed = 0
  for (const org of ((orphans ?? []) as unknown as OrphanJoin[])) {
    if ((org.organization_members ?? []).length > 0) continue
    await admin.from('organizations').delete().eq('id', org.id)
    removed += 1
  }

  // A conversation whose members are all gone is unreachable by anyone.
  const { data: ghosts } = await admin
    .from('conversations')
    .select('id, conversation_members ( profile_id )')
  type GhostJoin = { id: string; conversation_members: { profile_id: string }[] | null }
  for (const conversation of ((ghosts ?? []) as unknown as GhostJoin[])) {
    if ((conversation.conversation_members ?? []).length > 0) continue
    await admin.from('conversations').delete().eq('id', conversation.id)
    removed += 1
  }

  /**
   * Et les fichiers, que la suppression des comptes ne touche pas.
   *
   * Supprimer un compte fait partir ses lignes en cascade — `media_assets`
   * comprise — mais **pas** l'objet dans le stockage : Postgres ne sait rien du
   * bucket. Chaque exécution laissait donc ses tapes derrière elle. 427 s'étaient
   * accumulées avant qu'on s'en aperçoive, et elles ne sont atteignables par
   * personne : sans ligne `media_assets`, aucune URL signée ne peut être émise.
   */
  const { data: assets } = await admin.from('media_assets').select('bucket, path')
  const known = new Set((assets ?? []).map((asset) => `${asset.bucket}/${asset.path}`))
  let files = 0
  for (const bucket of ['selftapes']) {
    const { data: folders } = await admin.storage.from(bucket).list('', { limit: 1000 })
    for (const folder of folders ?? []) {
      if (folder.id !== null) continue
      const { data: inside } = await admin.storage.from(bucket).list(folder.name, { limit: 1000 })
      const stale = (inside ?? [])
        .map((file) => `${folder.name}/${file.name}`)
        .filter((key) => !known.has(`${bucket}/${key}`))
      if (stale.length === 0) continue
      await admin.storage.from(bucket).remove(stale)
      files += stale.length
    }
  }

  if (created.length > 0 || removed > 0 || files > 0) {
    console.log(
      `\n[teardown] removed ${created.length} E2E account(s)` +
        (removed > 0 ? `, ${removed} orphan row(s)` : '') +
        (files > 0 ? `, ${files} orphan file(s)` : ''),
    )
  }
}
