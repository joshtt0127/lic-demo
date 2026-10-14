-- Audition Review Queue™ — la mémoire, c'est le passé.
--
-- Une candidature retenue aujourd'hui sur ce casting s'affichait avec la
-- raison « You shortlisted this talent once before » : v_talent_memory compte
-- toutes les candidatures de l'organisation, y compris celle qu'on revoit.
-- Le feed retire désormais la contribution de la candidature elle-même avant
-- de parler d'historique (shortlist, rappel, casting, « connu ici »).

update public.intelligence_settings set engine_version = 'attention-2.3', updated_at = now();

create or replace function public.intelligence_feed(p_casting uuid)
returns table (
  application_id  uuid,
  talent_id       uuid,
  role_id         uuid,
  role_name       text,
  status          public.application_status,
  submitted_at    timestamptz,
  waiting_hours   numeric,
  band            text,
  band_rank       integer,
  queue_rank      bigint,
  reasons         jsonb,
  readiness       text,
  checks          jsonb,
  engine_version  text,
  computed_at     timestamptz
)
language sql
stable
as $$
with cfg as (
  select * from public.intelligence_settings where id
),
target as (
  select c.id, c.deadline_at, p.org_id
    from public.casting_calls c
    join public.projects p on p.id = c.project_id
   where c.id = p_casting
),
base as (
  select
    a.id                          as application_id,
    a.talent_id,
    a.role_id,
    r.name                        as role_name,
    a.status,
    a.submitted_at,
    a.viewed_at,
    a.decided_at,
    t.org_id,
    t.deadline_at,
    round(
      extract(epoch from (now() - coalesce(a.submitted_at, a.created_at)))::numeric / 3600, 1
    )                             as waiting_hours,
    case when t.deadline_at is null then null else
      round(extract(epoch from (t.deadline_at - now()))::numeric / 3600, 1)
    end                           as deadline_hours_left,
    (a.status not in ('cast', 'not_selected', 'withdrawn')) as open_decision
  from public.applications a
  join public.roles r  on r.id = a.role_id
  join target t        on t.id = r.casting_call_id
  where a.status <> 'draft'
),
votes as (
  select application_id, count(*) as team_votes
    from public.candidate_reviews group by application_id
),
attention as (
  select
    e.entity_id                                            as application_id,
    count(*) filter (where e.type = 'AUDITION_OPENED')     as tape_opens,
    count(*) filter (where e.type = 'AUDITION_COMPLETED')  as tape_completions,
    count(*) filter (where e.type = 'AUDITION_REWATCHED')  as tape_rewatches
  from public.events e
  where e.entity_type = 'application'
    and public.is_internal_attention(e.type)
  group by e.entity_id
),
pace as (
  select pm.org_id, greatest(coalesce(pm.median_hours_to_decision, 0), 0) as median_hours_to_decision
    from public.v_production_memory pm
),
discovery as (
  select * from public.discovery_signal(p_casting)
),
graph as (
  select * from public.talent_graph(array(select distinct b.talent_id from base b))
),
-- « A pass is not a failure » : les candidatures passées de ce comédien chez
-- CETTE organisation, écartées (`not_selected`) alors que l'équipe y avait
-- laissé un signal positif — un vote « good » ou une étiquette de ton positif.
-- Mémoire propre à l'organisation : les votes et étiquettes d'une autre
-- production ne sont jamais lus ici.
passed_apps as (
  select
    b.application_id,
    a2.id          as past_application,
    a2.decided_at,
    pr.title       as project_title,
    (select count(*) from public.candidate_reviews cr
      where cr.application_id = a2.id and cr.vote = 'good')            as good_votes,
    (select count(*) from public.application_labels al
       join public.review_labels rl on rl.id = al.label_id
      where al.application_id = a2.id and rl.tone in ('good', 'gold')) as positive_labels
  from base b
  join public.applications a2   on a2.talent_id = b.talent_id
                               and a2.id <> b.application_id
                               and a2.status = 'not_selected'
  join public.roles r2          on r2.id = a2.role_id
  join public.casting_calls c2  on c2.id = r2.casting_call_id
  join public.projects pr       on pr.id = c2.project_id and pr.org_id = b.org_id
),
passed_memory as (
  select
    application_id,
    count(*) filter (where good_votes > 0 or positive_labels > 0)  as castings,
    coalesce(sum(good_votes), 0)                                    as good_votes,
    coalesce(sum(positive_labels), 0)                               as labels,
    (array_agg(project_title order by decided_at desc nulls last)
       filter (where good_votes > 0 or positive_labels > 0))[1]     as project_title
  from passed_apps
  group by application_id
),
enriched as (
  select
    b.*,
    coalesce(v.team_votes, 0)                as team_votes,
    coalesce(at.tape_opens, 0)               as tape_opens,
    coalesce(at.tape_completions, 0)         as tape_completions,
    coalesce(at.tape_rewatches, 0)           as tape_rewatches,
    coalesce(m.applications, 0)              as org_applications,
    -- La mémoire, c'est le passé : la candidature qu'on revoit ne se compte
    -- pas elle-même (sinon une shortlist d'aujourd'hui devient « retenu une
    -- fois avant »).
    greatest(coalesce(m.shortlisted, 0)
      - (case when b.status in ('shortlisted', 'callback', 'offer', 'cast') then 1 else 0 end), 0)
                                             as org_shortlisted,
    greatest(coalesce(m.callbacks, 0)
      - (case when b.status in ('callback', 'offer', 'cast') then 1 else 0 end), 0)
                                             as org_callbacks,
    greatest(coalesce(m.cast_in, 0)
      - (case when b.status = 'cast' then 1 else 0 end), 0)
                                             as org_cast,
    (coalesce(m.shortlisted, 0)
      - (case when b.status in ('shortlisted', 'callback', 'offer', 'cast') then 1 else 0 end)) > 0
                                             as known_here,
    coalesce(pm.castings, 0)                 as passed_noted,
    coalesce(pm.good_votes, 0)               as passed_good_votes,
    coalesce(pm.labels, 0)                   as passed_labels,
    pm.project_title                         as passed_project,
    d.readiness,
    d.checks,
    coalesce(d.met, 0)                       as checks_met,
    coalesce(d.applicable, 0)                as checks_applicable,
    greatest(coalesce(g.productions_callback, 0) - (case when coalesce(m.callbacks, 0) > 0 then 1 else 0 end), 0)
                                             as peer_callbacks,
    greatest(coalesce(g.productions_cast, 0) - (case when coalesce(m.cast_in, 0) > 0 then 1 else 0 end), 0)
                                             as peer_casts,
    greatest(
      (select stale_floor_hours from cfg)::numeric,
      (select stale_multiplier from cfg) * coalesce(pc.median_hours_to_decision, 0)
    )                                        as stale_after_hours
  from base b
  left join votes v        on v.application_id = b.application_id
  left join attention at   on at.application_id = b.application_id
  left join discovery d    on d.application_id = b.application_id
  left join public.v_talent_memory m
         on m.talent_id = b.talent_id and m.org_id = b.org_id
  left join graph g        on g.talent_id = b.talent_id
  left join pace pc        on pc.org_id = b.org_id
  left join passed_memory pm on pm.application_id = b.application_id
),
judged as (
  select
    e.*,
    (e.open_decision and e.waiting_hours > e.stale_after_hours) as overdue,
    (e.open_decision and e.deadline_hours_left is not null
      and e.deadline_hours_left <= (select deadline_horizon_hours from cfg)
      and e.deadline_hours_left > 0)                            as deadline_close
  from enriched e
),
banded as (
  select
    j.*,
    case
      when not j.open_decision then 'all'
      -- Seuls des signaux **propres à cette candidature** promeuvent en
      -- Priority. `deadline_close` en est volontairement absent : identique
      -- pour toutes les lignes du casting, il les promouvait toutes.
      when j.known_here
        or j.tape_rewatches > 0
        or j.tape_completions > 0
        or j.team_votes > 0
        or j.status in ('shortlisted', 'callback', 'offer')
        -- Écarté ailleurs chez nous, mais remarqué : la mémoire le fait
        -- remonter plus tôt. C'est un rappel, pas un jugement.
        or j.passed_noted > 0
        or j.overdue                                 then 'priority'
      when j.org_applications <= 1
        and not j.known_here
        and j.tape_opens = 0
        and coalesce(j.readiness, 'thin') <> 'thin'  then 'discovery'
      else 'all'
    end as band
  from judged j
)
select
  b.application_id,
  b.talent_id,
  b.role_id,
  b.role_name,
  b.status,
  b.submitted_at,
  b.waiting_hours,
  b.band,
  case b.band when 'priority' then 1 when 'discovery' then 2 else 3 end as band_rank,
  row_number() over (
    partition by b.band
    order by
      -- L'échéance garde tout son poids **dans** l'ordre : c'est la seule
      -- contrainte qu'on ne rattrape pas.
      (b.deadline_close is not true),
      b.deadline_hours_left nulls last,
      case when b.band = 'discovery' and b.readiness = 'ready' then 0 else 1 end,
      case when b.band = 'discovery' then -b.checks_met else 0 end,
      b.waiting_hours desc,
      b.application_id
  ) as queue_rank,
  (
    select coalesce(jsonb_agg(x), '[]'::jsonb)
    from unnest(array[
      case when b.deadline_close then
        jsonb_build_object('code', 'deadline_close', 'hours_left', b.deadline_hours_left) end,
      case when b.overdue then
        jsonb_build_object('code', 'overdue',
          'waiting_hours', b.waiting_hours, 'usual_hours', round(b.stale_after_hours::numeric, 0)) end,
      case when b.org_cast > 0 then
        jsonb_build_object('code', 'worked_with_you', 'times', b.org_cast) end,
      case when b.org_cast = 0 and b.org_callbacks > 0 then
        jsonb_build_object('code', 'called_back_before', 'times', b.org_callbacks) end,
      case when b.org_cast = 0 and b.org_callbacks = 0 and b.org_shortlisted > 0 then
        jsonb_build_object('code', 'shortlisted_before', 'times', b.org_shortlisted) end,
      case when b.passed_noted > 0 and b.open_decision then
        jsonb_build_object('code', 'passed_but_noted',
          'castings', b.passed_noted, 'good_votes', b.passed_good_votes,
          'labels', b.passed_labels, 'project', b.passed_project) end,
      case when b.team_votes > 0 and b.open_decision then
        jsonb_build_object('code', 'team_waiting', 'votes', b.team_votes) end,
      case when b.tape_rewatches > 0 then
        jsonb_build_object('code', 'rewatched', 'times', b.tape_rewatches) end,
      case when b.tape_rewatches = 0 and b.tape_completions > 0 then
        jsonb_build_object('code', 'watched_fully') end,
      case when b.band = 'discovery' then
        jsonb_build_object('code', 'new_to_you') end,
      case when b.band = 'discovery' and b.peer_casts > 0 then
        jsonb_build_object('code', 'cast_elsewhere', 'productions', b.peer_casts) end,
      case when b.band = 'discovery' and b.peer_casts = 0 and b.peer_callbacks > 0 then
        jsonb_build_object('code', 'called_back_elsewhere', 'productions', b.peer_callbacks) end,
      case when b.band = 'discovery' and b.readiness = 'ready' then
        jsonb_build_object('code', 'submission_ready',
          'met', b.checks_met, 'applicable', b.checks_applicable) end,
      case when b.band = 'discovery' and b.readiness = 'partial' then
        jsonb_build_object('code', 'submission_partial',
          'met', b.checks_met, 'applicable', b.checks_applicable) end,
      case when b.open_decision and b.tape_opens = 0 and b.viewed_at is null
             and b.band = 'priority' then
        jsonb_build_object('code', 'never_opened', 'waiting_hours', b.waiting_hours) end
    ]) as t(x)
    where x is not null
  ) as reasons,
  b.readiness,
  coalesce(b.checks, '[]'::jsonb) as checks,
  (select engine_version from cfg) as engine_version,
  now()                           as computed_at
from banded b
order by band_rank, queue_rank;
$$;

comment on function public.intelligence_feed(uuid) is
  'Intelligence Feed™ v2.3 — la mémoire ne compte que le passé : la candidature revue n''est jamais sa propre raison.';

revoke execute on function public.intelligence_feed(uuid) from anon, public;
grant execute on function public.intelligence_feed(uuid) to authenticated;
