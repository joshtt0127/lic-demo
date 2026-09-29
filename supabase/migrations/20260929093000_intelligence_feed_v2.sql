-- INTELLIGENCE FEED™ v2 — la couche qui croise mémoire, contexte et découverte.
--
-- La v1 rangeait le travail avec ce qu'une production savait d'elle-même :
-- l'attente, la deadline, ses propres décisions passées. C'était juste, et
-- aveugle à deux choses que le mémo place au centre :
--
--   · **le Talent Graph** — ce que *d'autres* équipes ont décidé, ailleurs ;
--   · **le Discovery Signal** — ce qui, dans une candidature inconnue, se
--     vérifie sans jugement.
--
-- Cette version les branche. Le principe ne bouge pas d'un pouce : on range le
-- travail, pas les gens. Aucune des deux nouvelles sources ne produit de note,
-- et les deux entrent dans le feed sous la même forme que le reste — une
-- **raison nommée, avec ses faits**.
--
-- Deux décisions valent d'être écrites, parce qu'elles auraient pu partir de
-- travers :
--
-- **Le Talent Graph ne fabrique pas de priorité à lui seul.** « Trois
-- productions l'ont rappelé » remonte une candidature *dans la bande
-- Discovery*, là où l'équipe n'a aucun souvenir de la personne. Ça ne la
-- propulse pas devant une candidature que l'équipe a elle-même shortlistée et
-- laissée en plan. Sinon on construit exactement la boucle que le mémo
-- redoute : les déjà-vus partout, et un produit qui ne sait plus que confirmer.
--
-- **L'ordre de la bande Discovery change, et c'est tout l'objet du §9.** En v1
-- on y triait par ancienneté, faute de mieux : le plus ancien inconnu d'abord.
-- Maintenant un dossier exploitable passe devant un dossier incomplet, et à
-- dossier égal l'ancienneté tranche. C'est la différence entre « voici les
-- inconnus » et « voici les inconnus qui méritent vos dix prochaines minutes ».

update public.intelligence_settings set engine_version = 'attention-2.0', updated_at = now();

-- La signature gagne `readiness` et `checks` : Postgres refuse un
-- `create or replace` qui change le type de retour, il faut donc déposer
-- l'ancienne. Sans risque ici — aucune vue ni policy ne s'appuie dessus, seul
-- le client l'appelle.
drop function if exists public.intelligence_feed(uuid);

create function public.intelligence_feed(p_casting uuid)
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
  /** L'état du dossier : 'ready' · 'partial' · 'thin'. Jamais un état de la personne. */
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
-- ── Contexte : ce que le dossier vaut face au brief de *ce* rôle ───────────
discovery as (
  select * from public.discovery_signal(p_casting)
),
-- ── Mémoire inter-productions, pour les seuls talents de ce casting ───────
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
    -- Le graphe compte *toutes* les productions, la sienne comprise. Pour dire
    -- « d'autres équipes », il faut donc retirer ce que l'organisation a fait
    -- elle-même — sinon on lui présente son propre callback comme un avis
    -- extérieur, ce qui serait au mieux flatteur, au pire trompeur.
    greatest(coalesce(g.productions_callback, 0) - (case when coalesce(m.callbacks, 0) > 0 then 1 else 0 end), 0)
                                             as peer_callbacks,
    greatest(coalesce(g.productions_cast, 0) - (case when coalesce(m.cast_in, 0) > 0 then 1 else 0 end), 0)
                                             as peer_casts,
    greatest(coalesce(g.productions_applied, 0) - (case when coalesce(m.applications, 0) > 0 then 1 else 0 end), 0)
                                             as peer_productions,
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
      when j.known_here
        or j.tape_rewatches > 0
        or j.tape_completions > 0
        or j.team_votes > 0
        or j.status in ('shortlisted', 'callback', 'offer')
        or j.deadline_close
        or j.overdue                            then 'priority'
      -- Discovery : inconnue de cette équipe, jamais ouverte, et un dossier
      -- dont il reste quelque chose à regarder.
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
      (b.deadline_close is not true),
      b.deadline_hours_left nulls last,
      -- Dans Discovery seulement : un dossier exploitable avant un dossier
      -- incomplet. Ailleurs, l'état du dossier ne doit pas doubler l'attente —
      -- une candidature shortlistée par l'équipe passe devant, tape ou pas.
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
      -- Le Talent Graph, uniquement là où l'équipe n'a pas de souvenir propre :
      -- un avis extérieur éclaire un inconnu, il ne réécrit pas un jugement
      -- que l'équipe a déjà porté.
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
  'Intelligence Feed™ v2 — croise mémoire propre, trajectoire inter-productions et état du dossier. Range le travail, pas les gens.';

revoke execute on function public.intelligence_feed(uuid) from anon, public;
grant execute on function public.intelligence_feed(uuid) to authenticated;
