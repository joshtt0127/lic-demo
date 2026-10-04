/**
 * End-to-end backend check against the live project, using the public anon key
 * only (so RLS applies exactly as it will in the browser).
 *
 * Production creates a project → casting call → role → publishes.
 * Talent applies. Production moves the status. Talent sees it.
 * Plus the negative cases: talent cannot decide, talent cannot read reviews.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const stamp = Date.now()
const PASSWORD = 'LetItCast2026!'

const client = () => createClient(URL, ANON, { auth: { persistSession: false } })

/*
 * Comptes et organisation de test : `talent.<stamp>@letitcast.dev` et
 * `production.<stamp>@letitcast.dev`. Un run qui plante en route ne passe pas
 * par le nettoyage final — c'est arrivé, et ses comptes restaient en base.
 * On balaie donc AUSSI au démarrage et sur plantage, et on balaie tout ce qui
 * porte ce motif, pas seulement le run en cours.
 */
const TEST_ACCOUNT = /^(talent|production)\.\d+@letitcast\.dev$/
const admin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

async function sweepTestAccounts() {
  if (!admin) return 0
  let removed = 0
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    for (const user of data.users) {
      if (!TEST_ACCOUNT.test(user.email ?? '')) continue
      // Ses organisations d'abord (projets, castings… partent en cascade).
      const { data: owned } = await admin
        .from('organization_members')
        .select('org_id')
        .eq('profile_id', user.id)
        .eq('role', 'owner')
      for (const { org_id } of owned ?? []) await admin.from('organizations').delete().eq('id', org_id)
      await admin.auth.admin.deleteUser(user.id)
      removed += 1
    }
    if (data.users.length < 200) break
  }
  return removed
}

// Un plantage ne doit pas laisser de comptes derrière lui.
process.on('uncaughtException', async (error) => {
  console.error(`\n✗ crashed: ${error?.message ?? error}`)
  await sweepTestAccounts().catch(() => {})
  process.exit(1)
})
process.on('unhandledRejection', async (error) => {
  console.error(`\n✗ crashed: ${error?.message ?? error}`)
  await sweepTestAccounts().catch(() => {})
  process.exit(1)
})

const leftovers = await sweepTestAccounts()
if (leftovers) console.log(`\n· removed ${leftovers} test account(s) left by an earlier run`)

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function signUp(kind) {
  const supabase = client()
  const email = `${kind}.${stamp}@letitcast.dev`
  const { data, error } = await supabase.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { first_name: kind === 'talent' ? 'Maya' : 'Peter', last_name: kind === 'talent' ? 'Reyes' : 'Known' } },
  })
  if (error) throw new Error(`signUp ${kind}: ${error.message}`)
  if (!data.session) throw new Error(`signUp ${kind}: no session (email confirmation still on?)`)
  return { supabase, id: data.user.id, email }
}

console.log('\n1 · Accounts & profile trigger')
const talent = await signUp('talent')
const production = await signUp('production')
check('talent signed up with an active session', Boolean(talent.id))
check('production signed up with an active session', Boolean(production.id))

const { data: talentProfile } = await talent.supabase
  .from('profiles')
  .select('*')
  .eq('id', talent.id)
  .maybeSingle()
check('profile row created by the trigger', Boolean(talentProfile), talentProfile?.first_name)

console.log('\n2 · Account types & side profiles')
await talent.supabase.from('profiles').update({ account_type: 'talent' }).eq('id', talent.id)
const { error: tpError } = await talent.supabase
  .from('talent_profiles')
  .upsert({ profile_id: talent.id, headline: 'Actress · SAG-AFTRA', playing_age_min: 24, playing_age_max: 34 })
check('talent_profiles written by its owner', !tpError, tpError?.message)

await production.supabase.from('profiles').update({ account_type: 'production' }).eq('id', production.id)
const { error: ppError } = await production.supabase
  .from('production_profiles')
  .upsert({ profile_id: production.id, job_title: 'Casting director' })
check('production_profiles written by its owner', !ppError, ppError?.message)

const { error: hijack } = await talent.supabase
  .from('talent_profiles')
  .update({ headline: 'hacked' })
  .eq('profile_id', production.id)
  .select()
const { data: hijacked } = await production.supabase
  .from('talent_profiles')
  .select('headline')
  .eq('profile_id', production.id)
  .maybeSingle()
check('a talent cannot write another profile', !hijacked, hijack?.message ?? 'no row touched')

console.log('\n3 · Age coherence constraint')
const { error: ageError } = await talent.supabase
  .from('talent_profiles')
  .update({ playing_age_min: 40, playing_age_max: 20 })
  .eq('profile_id', talent.id)
check('playing_age_min > max rejected by the database', Boolean(ageError), ageError?.code)

console.log('\n4 · Organization, project, casting call, role')
const { data: org, error: orgError } = await production.supabase
  .from('organizations')
  .insert({ name: `A24 ${stamp}`, slug: `a24-${stamp}`, created_by: production.id })
  .select('*')
  .single()
check('organization created', Boolean(org), orgError?.message)

const { error: memberError } = await production.supabase
  .from('organization_members')
  .insert({ org_id: org.id, profile_id: production.id, role: 'owner' })
check('creator joined as owner', !memberError, memberError?.message)

const { data: project, error: projectError } = await production.supabase
  .from('projects')
  .insert({ org_id: org.id, title: 'Project Alpha', status: 'casting', created_by: production.id })
  .select('*')
  .single()
check('project created by an org member', Boolean(project), projectError?.message)

const { data: forbiddenProject, error: forbiddenError } = await talent.supabase
  .from('projects')
  .insert({ org_id: org.id, title: 'Talent should not create this' })
  .select('*')
  .maybeSingle()
check('a talent cannot create a project in that org', !forbiddenProject, forbiddenError?.message)

const { data: casting, error: castingError } = await production.supabase
  .from('casting_calls')
  .insert({ project_id: project.id, title: 'Project Alpha — open call', status: 'draft', created_by: production.id })
  .select('*')
  .single()
check('casting call created as draft', Boolean(casting), castingError?.message)

const { data: role, error: roleError } = await production.supabase
  .from('roles')
  .insert({ casting_call_id: casting.id, name: 'Claire', role_type: 'lead', playing_age_min: 28, playing_age_max: 40 })
  .select('*')
  .single()
check('role Claire created', Boolean(role), roleError?.message)

console.log('\n5 · Publication gates visibility')
const { data: hiddenRole } = await talent.supabase.from('roles').select('id').eq('id', role.id).maybeSingle()
check('a draft casting hides its roles from talents', !hiddenRole)

const { error: earlyApply } = await talent.supabase
  .from('applications')
  .insert({ role_id: role.id, talent_id: talent.id, status: 'submitted' })
check('applying to an unpublished role is refused', Boolean(earlyApply), earlyApply?.code)

await production.supabase
  .from('casting_calls')
  .update({ status: 'published', published_at: new Date().toISOString() })
  .eq('id', casting.id)

const { data: visibleRole } = await talent.supabase
  .from('roles')
  .select('id, name')
  .eq('id', role.id)
  .maybeSingle()
check('once published, the talent sees the role', Boolean(visibleRole), visibleRole?.name)

console.log('\n6 · Application — the single source of truth')
// Règle « adultes uniquement » (migration 20260924104000) : pas de candidature
// sans confirmation de majorité — c'est ce que fait l'onboarding talent.
const { error: minorError } = await talent.supabase
  .from('applications')
  .insert({ role_id: role.id, talent_id: talent.id, status: 'submitted', submitted_at: new Date().toISOString() })
check('applying before confirming adulthood is refused', Boolean(minorError), minorError?.message)
const { error: adultError } = await talent.supabase
  .from('profiles')
  .update({ adult_confirmed_at: new Date().toISOString() })
  .eq('id', talent.id)
check('talent confirms being an adult', !adultError, adultError?.message)

// Éligibilité (migration 20260924112000) : nom, photo, âge de jeu et ville
// avant de candidater — ce que l'onboarding fait remplir.
const { error: eligibleError } = await talent.supabase
  .from('profiles')
  .update({ city: 'Paris', avatar_url: 'https://example.com/avatar.jpg' })
  .eq('id', talent.id)
const { data: missing } = await talent.supabase.rpc('missing_for_application', { p_talent: talent.id })
check(
  'talent profile complete enough to apply',
  !eligibleError && Array.isArray(missing) && missing.length === 0,
  eligibleError?.message ?? JSON.stringify(missing),
)

const { data: application, error: applyError } = await talent.supabase
  .from('applications')
  .insert({ role_id: role.id, talent_id: talent.id, status: 'submitted', submitted_at: new Date().toISOString() })
  .select('*')
  .single()
check('talent applied', Boolean(application), applyError?.message)

const { data: seenByProduction } = await production.supabase
  .from('applications')
  .select('id, status, talent_id')
  .eq('id', application?.id)
  .maybeSingle()
check('production sees the SAME application row', seenByProduction?.id === application?.id, seenByProduction?.status)

const { data: candidate } = await production.supabase
  .from('v_candidates')
  .select('*')
  .eq('application_id', application.id)
  .maybeSingle()
check(
  'v_candidates joins the talent identity',
  candidate?.name?.includes('Maya'),
  `${candidate?.name} · ${candidate?.role_name} · score ${candidate?.score}`,
)

console.log('\n7 · Status authority')
const { error: illegalStatus } = await talent.supabase
  .from('applications')
  .update({ status: 'shortlisted' })
  .eq('id', application.id)
check('talent cannot shortlist themselves', Boolean(illegalStatus), illegalStatus?.message?.slice(0, 60))

const { error: promoteError } = await production.supabase
  .from('applications')
  .update({ status: 'shortlisted', decided_at: new Date().toISOString() })
  .eq('id', application.id)
check('production can shortlist', !promoteError, promoteError?.message)

const { data: talentView } = await talent.supabase
  .from('applications')
  .select('status')
  .eq('id', application.id)
  .maybeSingle()
check('talent sees the new status', talentView?.status === 'shortlisted', talentView?.status)

console.log('\n8 · Reviews and notes stay inside production')
const { error: reviewError } = await production.supabase
  .from('candidate_reviews')
  .insert({ application_id: application.id, reviewer_id: production.id, vote: 'good', comment: 'Strong tape' })
check('production can vote', !reviewError, reviewError?.message)

const { data: notesForProduction } = await production.supabase
  .from('candidate_reviews')
  .select('vote')
  .eq('application_id', application.id)
check('production reads its votes', notesForProduction?.length === 1)

const { data: reviewsSeenByTalent } = await talent.supabase
  .from('candidate_reviews')
  .select('vote')
  .eq('application_id', application.id)
check('the talent cannot read the team votes', (reviewsSeenByTalent ?? []).length === 0)

const { data: talentCandidateView } = await talent.supabase
  .from('v_candidates')
  .select('good_count, score')
  .eq('application_id', application.id)
  .maybeSingle()
check(
  'even through v_candidates the tally reads zero for the talent',
  talentCandidateView?.good_count === 0,
  `good_count=${talentCandidateView?.good_count}`,
)

const { data: prodCandidateView } = await production.supabase
  .from('v_candidates')
  .select('good_count, score')
  .eq('application_id', application.id)
  .maybeSingle()
check(
  'production sees the real tally',
  prodCandidateView?.good_count === 1 && Number(prodCandidateView?.score) === 100,
  `good_count=${prodCandidateView?.good_count} score=${prodCandidateView?.score}`,
)

console.log('\n9 · Messaging')
const { data: conversation, error: convError } = await production.supabase
  .from('conversations')
  .insert({ subject: 'Callback', context_type: 'application', context_id: application.id, org_id: org.id, created_by: production.id })
  .select('*')
  .single()
check('conversation created', Boolean(conversation), convError?.message)

const { error: membersError } = await production.supabase
  .from('conversation_members')
  .insert([
    { conversation_id: conversation.id, profile_id: production.id },
    { conversation_id: conversation.id, profile_id: talent.id },
  ])
check('both sides added to the conversation', !membersError, membersError?.message)

const { error: msgError } = await production.supabase
  .from('messages')
  .insert({ conversation_id: conversation.id, sender_id: production.id, body: "We'd like to invite you to a callback." })
check('production sent a message', !msgError, msgError?.message)

const { data: inbox } = await talent.supabase
  .from('messages')
  .select('body')
  .eq('conversation_id', conversation.id)
check('talent received it', inbox?.length === 1, inbox?.[0]?.body)

const { error: replyError } = await talent.supabase
  .from('messages')
  .insert({ conversation_id: conversation.id, sender_id: talent.id, body: 'Thank you — Tuesday works.' })
check('talent replied', !replyError, replyError?.message)

const { data: thread } = await production.supabase
  .from('messages')
  .select('body')
  .eq('conversation_id', conversation.id)
  .order('created_at')
check('production sees the whole thread', thread?.length === 2)

console.log('\n10 · Project stats view')
const { data: stats } = await production.supabase
  .from('v_project_stats')
  .select('*')
  .eq('project_id', project.id)
  .maybeSingle()
check(
  'KPIs are derived, not frozen fixtures',
  Number(stats?.roles) === 1 && Number(stats?.submissions) === 1 && Number(stats?.shortlist) === 1,
  JSON.stringify(stats),
)

// Le retrait vient en dernier : il est définitif (une candidature retirée ne
// revient pas), donc le tester plus tôt cassait la suite du scénario.
console.log('\n10b · Withdrawal is the talent\'s, and final')
const { error: withdrawError } = await talent.supabase
  .from('applications')
  .update({ status: 'withdrawn' })
  .eq('id', application.id)
check('talent can withdraw', !withdrawError, withdrawError?.message)
const { error: resubmitError } = await talent.supabase
  .from('applications')
  .update({ status: 'submitted' })
  .eq('id', application.id)
check('a withdrawn application cannot be revived', Boolean(resubmitError), resubmitError?.message?.slice(0, 70))

console.log('\n11 · Video Casting Breakdown™ — who sees a brief')
const anon = client()
const brief = (roleId, visibility) => ({
  project_id: project.id,
  role_id: roleId,
  url: `https://example.com/brief-${stamp}-${roleId ? 'role' : 'project'}.mp4`,
  visibility,
})
const { data: projectBrief, error: projectBriefError } = await production.supabase
  .from('brief_videos')
  .insert(brief(null, 'applicants'))
  .select('id')
  .single()
check('production records a project brief', Boolean(projectBrief), projectBriefError?.message)
const { error: roleBriefError } = await production.supabase.from('brief_videos').insert(brief(role.id, 'internal'))
check('production records an internal role brief', !roleBriefError, roleBriefError?.message)

const { data: talentBriefs } = await talent.supabase.from('brief_videos').select('role_id').eq('project_id', project.id)
check(
  'a talent sees the applicant brief, not the internal one',
  talentBriefs?.length === 1 && talentBriefs[0].role_id === null,
  JSON.stringify(talentBriefs),
)
const { data: anonBefore } = await anon.from('brief_videos').select('id').eq('project_id', project.id)
check('a visitor sees no brief that is not public', (anonBefore ?? []).length === 0)

await production.supabase.from('brief_videos').update({ visibility: 'public' }).eq('id', projectBrief?.id)
const { data: anonAfter } = await anon.from('brief_videos').select('id').eq('project_id', project.id)
check('a visitor sees the brief once it is public', (anonAfter ?? []).length === 1)

const { error: talentWrite } = await talent.supabase.from('brief_videos').insert(brief(null, 'public'))
check('a talent cannot record a brief', Boolean(talentWrite), talentWrite?.message)

const { data: extraction, error: extractionError } = await production.supabase
  .from('brief_extractions')
  .insert({ org_id: org.id, target: 'project', video_url: brief(null, 'public').url })
  .select('id')
  .single()
check('production opens a pending extraction', Boolean(extraction), extractionError?.message)
const { error: forged } = await production.supabase
  .from('brief_extractions')
  .update({ status: 'ready', fields: [{ field: 'title', status: 'detected', value: 'forged' }] })
  .eq('id', extraction?.id)
check('the browser cannot write an extraction result', Boolean(forged), forged?.message)
const { data: talentExtractions } = await talent.supabase.from('brief_extractions').select('id').eq('org_id', org.id)
check('a talent cannot read the production extractions', (talentExtractions ?? []).length === 0)

console.log('\n12 · Cleanup')
// The run created real accounts and a real org; remove them so the project only
// ever holds the seeded demo data (needs the local service-role key).
if (admin) {
  const removed = await sweepTestAccounts()
  check('test accounts and org removed', removed >= 2, `${removed} account(s)`)
} else {
  console.log('  · no service-role key — left the test rows in place')
}

console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}\n`)
process.exit(failures === 0 ? 0 : 1)
