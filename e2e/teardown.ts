import { createClient } from '@supabase/supabase-js'
import { localEnv } from './env'

/** Removes the accounts the specs created, so the project keeps only the seed. */
export default async function teardown() {
  const env = localEnv()
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: orgs } = await admin.from('organizations').select('id, name').ilike('name', 'Studio E2E%')
  for (const org of orgs ?? []) {
    await admin.from('organizations').delete().eq('id', org.id)
  }

  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const created = (data?.users ?? []).filter(
    (user) => user.email?.startsWith('e2e.') && user.email.endsWith('@letitcast.dev'),
  )
  for (const user of created) {
    await admin.auth.admin.deleteUser(user.id)
  }
  if (created.length > 0) {
    console.log(`\n[teardown] removed ${created.length} E2E account(s)`)
  }
}
