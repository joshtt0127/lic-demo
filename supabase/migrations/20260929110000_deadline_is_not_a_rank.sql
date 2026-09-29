-- Une échéance ne classe pas : elle est la même pour tout le monde.
--
-- Constaté en peuplant un casting de démonstration avec douze candidatures
-- variées — inconnues au dossier complet, dossiers vides, profils shortlistés
-- laissés en plan, comédiens repérés ailleurs. Résultat : **les douze en
-- Priority review**, la bande Discovery vide, et un feed qui ne trie plus rien.
--
-- La cause tient en une phrase, et elle vaut au-delà de ce cas :
--
--   **Un signal identique pour toutes les lignes ne peut pas les départager.**
--
-- `deadline_close` est une propriété du *casting*, pas de la candidature. En
-- faire un motif de promotion revenait à promouvoir tout le monde dès que
-- l'échéance approchait — c'est-à-dire exactement au moment où trier compte le
-- plus. Le produit disait « tout est prioritaire », ce qui est une autre façon
-- de dire « je ne sais pas ».
--
-- L'échéance reste donc :
--   · **une raison affichée** — « the deadline is in 40 hours » est vrai, utile,
--     et l'équipe doit le lire ;
--   · **le premier critère d'ordre** — à l'intérieur de chaque bande, ce qui
--     touche à une échéance proche passe devant, parce que c'est la seule
--     contrainte qu'on ne rattrape pas.
--
-- Ce qu'elle cesse d'être : un motif de bande. La bande Priority redevient ce
-- qu'elle doit être — ce sur quoi *cette candidature-là* attend un geste :
-- l'équipe s'est engagée, le comédien est déjà connu de la maison, ou le
-- dossier traîne depuis plus longtemps que le rythme habituel.

update public.intelligence_settings set engine_version = 'attention-2.1', updated_at = now();

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
enriched as (
  select
    b.*,
    coalesce(v.team_votes, 0)                as team_votes,
    coalesce(at.tape_opens, 0)               as tape_opens,
    coalesce(at.tape_completions, 0)         as tape_completions,
    coalesce(at.tape_rewatches, 0)           as tape_rewatches,
    coalesce(m.applications, 0)              as org_applications,
    coalesce(m.shortlisted, 0)               as org_shortlisted,
    coalesce(m.callbacks, 0)                 as org_callbacks,
    coalesce(m.cast_in, 0)                   as org_cast,
    coalesce(m.known_here, false)            as known_here,
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
  'Intelligence Feed™ v2.1 — l''échéance est une raison et un ordre, jamais une bande : identique pour toutes les lignes, elle ne peut pas les départager.';

revoke execute on function public.intelligence_feed(uuid) from anon, public;
grant execute on function public.intelligence_feed(uuid) to authenticated;
