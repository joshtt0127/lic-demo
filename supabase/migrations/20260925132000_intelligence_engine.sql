-- INTELLIGENCE — 3. Le moteur : des bandes d'attention, pas un classement.
--
-- Ce fichier est l'endroit où le produit peut déraper, alors autant écrire la
-- règle en haut : **on ne note pas les gens.**
--
-- Il n'y a pas de score de talent, pas de pourcentage de correspondance, pas de
-- tri des candidats du meilleur au moins bon. Un pourcentage se compare, et dès
-- qu'il se compare il devient un classement d'êtres humains avec l'autorité
-- tranquille d'un chiffre. La tentation est réelle : un `score numeric` aurait
-- été plus court à écrire, plus facile à trier et plus vendeur en démo.
--
-- Ce que le moteur fait à la place : il range **le travail**, pas les gens. Il
-- répond à « qu'est-ce qui demande ton attention maintenant », et jamais à « qui
-- est le meilleur ». Trois bandes :
--
--   · **Priority review** — quelque chose attend une décision : l'équipe s'est
--     déjà engagée, la deadline approche, ou ça traîne par rapport au rythme
--     habituel de cette production ;
--   · **Discovery** — des candidatures complètes, de gens que cette production
--     ne connaît pas, que personne n'a encore ouvertes. Sans cette bande, un
--     inconnu finit systématiquement derrière un visage familier : la mémoire,
--     laissée seule, se referme sur elle-même ;
--   · **All applicants** — tout le reste, toujours accessible. Aucune
--     candidature n'est masquée, jamais. Le produit hiérarchise l'attention, il
--     ne filtre pas l'accès.
--
-- À l'intérieur d'une bande, l'ordre est celui de l'attente : qui attend une
-- réponse depuis le plus longtemps, deadline en tête. C'est un ordre sur des
-- délais, pas sur des personnes — deux candidats identiques passent dans
-- l'ordre où ils ont postulé, et rien dans le tri ne lit un attribut du comédien.
--
-- Chaque ligne porte ses **raisons**, avec les faits qui les fondent. Pas
-- d'explication générée après coup pour habiller une décision opaque : la raison
-- *est* la règle qui a produit la bande. Si on ne peut pas la nommer, la ligne
-- ne remonte pas.
--
-- Et aucun appel de modèle par candidature : tout ce fichier est du SQL
-- déterministe. Deux exécutions sur les mêmes faits donnent le même résultat,
-- ce qui est la condition pour qu'une équipe puisse contester ce qu'elle voit.

-- ── Ce qui se règle sans redéployer ───────────────────────────────────────

create table if not exists public.intelligence_settings (
  /** Une seule ligne, contrainte par la clé primaire. */
  id                      boolean primary key default true check (id),
  /** Change à chaque modification des règles : toute sortie du feed la porte. */
  engine_version          text    not null default 'attention-1.0',
  /** Une deadline dans moins de N heures rend une candidature non décidée urgente. */
  deadline_horizon_hours  integer not null default 72,
  /** « Ça traîne » = N fois le délai médian de décision *de cette production*. */
  stale_multiplier        numeric not null default 2.0,
  /** Plancher, pour une production trop jeune pour avoir une médiane. */
  stale_floor_hours       integer not null default 72,
  updated_at              timestamptz not null default now()
);

comment on table public.intelligence_settings is
  'Les seuils du moteur d''attention. Se règlent en base, pas dans le code.';

insert into public.intelligence_settings (id) values (true) on conflict (id) do nothing;

alter table public.intelligence_settings enable row level security;

drop policy if exists intelligence_settings_read on public.intelligence_settings;
create policy intelligence_settings_read on public.intelligence_settings
  for select to authenticated using (true);

-- Aucune policy d'écriture : les seuils se changent avec les clés du projet.

-- ── Le feed ───────────────────────────────────────────────────────────────

/**
 * L'ordre d'attention pour un casting, et pourquoi.
 *
 * `security invoker` (le défaut) : la fonction ne voit que ce que les policies
 * laissent voir à l'appelant. Un compte qui n'est pas membre de l'organisation
 * n'obtient pas une erreur, il obtient zéro ligne — il n'y a pas d'autre
 * chemin, donc pas de contrôle d'accès à ne pas oublier ici.
 */
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
    a.note,
    a.headshot_id,
    a.showreel_id,
    t.org_id,
    t.deadline_at,
    round(
      extract(epoch from (now() - coalesce(a.submitted_at, a.created_at)))::numeric / 3600, 1
    )                             as waiting_hours,
    case when t.deadline_at is null then null else
      round(extract(epoch from (t.deadline_at - now()))::numeric / 3600, 1)
    end                           as deadline_hours_left,
    /**
     * Une candidature « ouverte » attend encore un geste.
     *
     * Volontairement sur le **statut seul**. `decided_at` porte la date du
     * dernier changement de statut, pas celle d'une décision close : il est
     * rempli dès qu'on marque une candidature « vue ». S'en servir ici faisait
     * disparaître de la file exactement les candidatures en cours — un profil
     * shortlisté, donc en attente d'un rappel, tombait dans « tout le reste ».
     * Les seuls états terminaux sont : distribué, écarté, retiré.
     */
    (a.status not in ('cast', 'not_selected', 'withdrawn')) as open_decision
  from public.applications a
  join public.roles r  on r.id = a.role_id
  join target t        on t.id = r.casting_call_id
  where a.status <> 'draft'
),
tape as (
  select
    st.application_id,
    max(st.submitted_at)                              as tape_at,
    max(tc.score)                                     as tape_score
  from public.self_tapes st
  left join public.tape_checks tc on tc.self_tape_id = st.id
  group by st.application_id
),
votes as (
  select application_id, count(*) as team_votes
    from public.candidate_reviews
   group by application_id
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
  -- Le rythme de *cette* production. Sans lui, « ça traîne » voudrait dire la
  -- même chose pour une équipe qui décide en 48 h et une qui met trois semaines.
  select
    pm.org_id,
    greatest(
      coalesce(pm.median_hours_to_decision, 0),
      0
    ) as median_hours_to_decision
  from public.v_production_memory pm
),
enriched as (
  select
    b.*,
    coalesce(tp.tape_at is not null, false)  as has_tape,
    tp.tape_score,
    coalesce(v.team_votes, 0)                as team_votes,
    coalesce(at.tape_opens, 0)               as tape_opens,
    coalesce(at.tape_completions, 0)         as tape_completions,
    coalesce(at.tape_rewatches, 0)           as tape_rewatches,
    coalesce(m.applications, 0)              as org_applications,
    coalesce(m.shortlisted, 0)               as org_shortlisted,
    coalesce(m.callbacks, 0)                 as org_callbacks,
    coalesce(m.cast_in, 0)                   as org_cast,
    coalesce(m.known_here, false)            as known_here,
    greatest(
      (select stale_floor_hours from cfg)::numeric,
      (select stale_multiplier from cfg) * coalesce(pc.median_hours_to_decision, 0)
    )                                        as stale_after_hours
  from base b
  left join tape tp        on tp.application_id = b.application_id
  left join votes v        on v.application_id = b.application_id
  left join attention at   on at.application_id = b.application_id
  left join public.v_talent_memory m
         on m.talent_id = b.talent_id and m.org_id = b.org_id
  left join pace pc        on pc.org_id = b.org_id
),
judged as (
  select
    e.*,
    -- Une candidature complète : un enregistrement, ou de quoi se faire un avis.
    (e.has_tape or (e.note is not null and e.headshot_id is not null)) as complete_submission,
    -- « Ça traîne » se mesure contre le rythme de l'équipe, pas contre une norme.
    (e.open_decision and e.waiting_hours > e.stale_after_hours)         as overdue,
    (e.open_decision and e.deadline_hours_left is not null
      and e.deadline_hours_left <= (select deadline_horizon_hours from cfg)
      and e.deadline_hours_left > 0)                                    as deadline_close
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
      -- Protection des nouveaux : jamais vus par cette équipe, dossier complet,
      -- et personne ne les a encore ouverts. C'est la seule bande qui existe
      -- pour contrer un effet du produit lui-même.
      when j.org_applications <= 1
        and not j.known_here
        and j.complete_submission
        and j.tape_opens = 0                    then 'discovery'
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
      -- La deadline d'abord : c'est la seule contrainte qu'on ne peut pas rattraper.
      (b.deadline_close is not true),
      b.deadline_hours_left nulls last,
      -- Puis l'attente : qui n'a pas de réponse depuis le plus longtemps.
      b.waiting_hours desc,
      b.application_id
  ) as queue_rank,
  /**
   * Les raisons, avec leurs faits. L'interface les traduit ; la base dit
   * seulement ce qui est vrai, et avec quels nombres.
   */
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
      case when b.band = 'discovery' and b.has_tape then
        jsonb_build_object('code', 'tape_ready', 'quality', b.tape_score) end,
      case when b.band = 'discovery' and not b.has_tape then
        jsonb_build_object('code', 'complete_submission') end,
      -- `viewed_at` précède la capture d'attention : sans ce repli, toute
      -- candidature antérieure à la couche signal se dirait « jamais ouverte ».
      case when b.open_decision and b.tape_opens = 0 and b.viewed_at is null
             and b.band = 'priority' then
        jsonb_build_object('code', 'never_opened', 'waiting_hours', b.waiting_hours) end
    ]) as t(x)
    where x is not null
  ) as reasons,
  (select engine_version from cfg) as engine_version,
  now()                            as computed_at
from banded b
order by band_rank, queue_rank;
$$;

comment on function public.intelligence_feed(uuid) is
  'Range le travail, pas les gens : bandes d''attention et raisons factuelles pour un casting.';

revoke execute on function public.intelligence_feed(uuid) from anon, public;
grant execute on function public.intelligence_feed(uuid) to authenticated;
