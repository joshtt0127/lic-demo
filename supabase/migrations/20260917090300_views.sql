-- Let It Cast — read models.
--
-- `security_invoker = true` (PG 15+) makes the view run with the caller's rights,
-- so the underlying RLS still applies. That is what keeps a talent from reading
-- the team votes on their own application through the view: the review rows are
-- filtered out and the tallies come back as zero.

/**
 * The production-side candidate card: one row per application, enriched with the
 * talent identity and the team-review tally. Replaces the standalone `Candidate`
 * fixture type — application and candidate are now the same entity.
 */
create view public.v_candidates with (security_invoker = true) as
select
  a.id                                        as application_id,
  a.role_id,
  a.talent_id,
  a.status,
  a.note,
  a.submitted_at,
  a.viewed_at,
  a.created_at,
  r.name                                      as role_name,
  r.casting_call_id,
  c.project_id,
  coalesce(nullif(tp.professional_name, ''),
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) as name,
  p.avatar_url,
  p.city,
  p.country,
  tp.gender,
  tp.playing_age_min,
  tp.playing_age_max,
  tp.nationalities,
  tp.experience_level,
  coalesce(
    (select array_agg(tl.language order by tl.language)
       from public.talent_languages tl
      where tl.talent_id = a.talent_id),
    '{}'::text[]
  )                                           as languages,
  coalesce(rv.good, 0)                        as good_count,
  coalesce(rv.maybe, 0)                       as maybe_count,
  coalesce(rv.no, 0)                          as no_count,
  case
    when coalesce(rv.total, 0) = 0 then 0
    else round((coalesce(rv.good, 0) * 100 + coalesce(rv.maybe, 0) * 50)::numeric / rv.total)
  end                                         as score,
  exists (select 1 from public.self_tapes st where st.application_id = a.id) as has_self_tape
from public.applications a
join public.roles r                on r.id = a.role_id
join public.casting_calls c        on c.id = r.casting_call_id
join public.profiles p             on p.id = a.talent_id
left join public.talent_profiles tp on tp.profile_id = a.talent_id
left join (
  select application_id,
         count(*)                                      as total,
         count(*) filter (where vote = 'good')          as good,
         count(*) filter (where vote = 'maybe')         as maybe,
         count(*) filter (where vote = 'no')            as no
    from public.candidate_reviews
   group by application_id
) rv on rv.application_id = a.id;

comment on view public.v_candidates is
  'Studio candidate cards = applications joined with talent identity and review tallies.';

/** Per-role counters used by the studio dashboard and the role list. */
create view public.v_role_stats with (security_invoker = true) as
select
  r.id                                                                as role_id,
  r.casting_call_id,
  c.project_id,
  count(a.id) filter (where a.status <> 'draft')                      as submissions,
  count(a.id) filter (where a.status = 'submitted')                   as new_submissions,
  count(a.id) filter (where a.status in ('shortlisted', 'callback', 'offer', 'cast')) as shortlist,
  count(a.id) filter (where a.status = 'callback')                    as callbacks,
  count(a.id) filter (where a.status = 'cast')                        as booked
from public.roles r
join public.casting_calls c on c.id = r.casting_call_id
left join public.applications a on a.role_id = r.id
group by r.id, r.casting_call_id, c.project_id;

/** Project KPI bar (replaces the frozen `kpis` fixture). */
create view public.v_project_stats with (security_invoker = true) as
select
  p.id                                                    as project_id,
  count(distinct r.id)                                    as roles,
  count(distinct r.id) filter (where r.role_type = 'lead')       as lead_roles,
  count(distinct r.id) filter (where r.role_type <> 'lead')      as supporting_roles,
  count(a.id) filter (where a.status <> 'draft')          as submissions,
  count(a.id) filter (where a.submitted_at >= now() - interval '1 day') as submissions_today,
  count(a.id) filter (where a.status in ('shortlisted', 'callback', 'offer', 'cast')) as shortlist,
  count(a.id) filter (where a.status = 'callback')        as callbacks,
  count(a.id) filter (where a.status = 'cast')            as booked
from public.projects p
left join public.casting_calls c on c.project_id = p.id
left join public.roles r on r.casting_call_id = c.id
left join public.applications a on a.role_id = r.id
group by p.id;
