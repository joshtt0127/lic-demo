-- INTELLIGENCE LIVE™ — de quoi rendre le moteur observable, sans rien inventer.
--
-- Le brief demande un « capot vitré » : voir la mécanique travailler. Tout
-- l'intérêt tient dans un détail — **ce qu'on montre doit être vrai**. Un flux
-- de faux signaux et des millisecondes décoratives feraient une jolie
-- animation et une preuve d'ingénierie mensongère, c'est-à-dire l'inverse de
-- l'effet recherché. Le jour où quelqu'un ouvre la console et compare, la
-- confiance construite par le widget se retourne d'un coup.
--
-- D'où deux ajouts, et rien de plus :
--
--   1. `events` passe en Realtime. Le Signal Stream diffusera donc les faits
--      réels, au moment où ils sont écrits, filtrés par les policies
--      existantes — une équipe ne verra jamais que les siens.
--   2. `intelligence_trace()` mesure vraiment. Chaque étape est chronométrée
--      avec `clock_timestamp()` et renvoie ses propres compteurs. « 186
--      trajectoires en 42 ms » sera 186 trajectoires en 42 ms.

-- ── 1. Le flux de signaux ─────────────────────────────────────────────────
--
-- `events` porte déjà sa policy de lecture : le sujet pour ses propres faits
-- (hors gestes de revue), les membres pour ceux de leur organisation. Realtime
-- applique cette policy à chaque diffusion — il n'y a donc pas de filtre à
-- ajouter côté client, et pas de fuite possible si quelqu'un s'abonne
-- largement.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- ── 2. La trace d'exécution ───────────────────────────────────────────────

/**
 * Ce que le moteur fait, étape par étape, avec les vraies durées.
 *
 * Volontairement une fonction séparée plutôt qu'un champ ajouté au feed : le
 * feed est appelé pour afficher des candidatures, et il n'a aucune raison de
 * payer une instrumentation dont l'écran de travail n'a pas besoin. Ici on
 * accepte de refaire le calcul, parce que c'est précisément le calcul qu'on
 * veut montrer.
 *
 * `security invoker` : chaque étape lit à travers les policies de l'appelant.
 * Un compte sans accès au casting obtient une trace vide, pas une erreur —
 * l'observabilité ne doit pas devenir un canal d'information sur l'existence
 * de castings qu'on ne peut pas voir.
 */
create or replace function public.intelligence_trace(p_casting uuid)
returns table (
  seq         integer,
  step        text,
  detail      jsonb,
  duration_ms numeric
)
language plpgsql
stable
as $$
declare
  t0        timestamptz;
  v_casting record;
  v_talents uuid[];
  v_traj    integer;
  v_subs    integer;
  v_ready   integer;
  v_partial integer;
  v_thin    integer;
  v_rows    integer;
  v_prio    integer;
  v_disc    integer;
  v_engine  text;
begin
  -- Étape 1 — le contexte : pour quel casting le Feed est-il recomposé.
  t0 := clock_timestamp();
  select c.id, c.title, c.deadline_at, count(r.id) as roles
    into v_casting
    from public.casting_calls c
    left join public.roles r on r.casting_call_id = c.id
   where c.id = p_casting
   group by c.id, c.title, c.deadline_at;

  if v_casting.id is null then
    return; -- Pas d'accès : aucune trace, et surtout aucun indice.
  end if;

  seq := 1;
  step := 'context';
  detail := jsonb_build_object(
    'casting', v_casting.title,
    'roles', v_casting.roles,
    'deadline_at', v_casting.deadline_at
  );
  duration_ms := round(extract(milliseconds from clock_timestamp() - t0)::numeric, 1);
  return next;

  -- Étape 2 — la mémoire : les trajectoires mobilisées pour ce casting.
  t0 := clock_timestamp();
  select array_agg(distinct a.talent_id)
    into v_talents
    from public.applications a
    join public.roles r on r.id = a.role_id
   where r.casting_call_id = p_casting and a.status <> 'draft';

  select count(*) into v_traj
    from public.talent_graph(coalesce(v_talents, '{}'::uuid[]));

  seq := 2;
  step := 'memory';
  detail := jsonb_build_object(
    'trajectories', coalesce(v_traj, 0),
    'talents', coalesce(array_length(v_talents, 1), 0)
  );
  duration_ms := round(extract(milliseconds from clock_timestamp() - t0)::numeric, 1);
  return next;

  -- Étape 3 — la découverte : l'état des dossiers, vérification par vérification.
  t0 := clock_timestamp();
  select count(*),
         count(*) filter (where d.readiness = 'ready'),
         count(*) filter (where d.readiness = 'partial'),
         count(*) filter (where d.readiness = 'thin')
    into v_subs, v_ready, v_partial, v_thin
    from public.discovery_signal(p_casting) d;

  seq := 3;
  step := 'discovery';
  detail := jsonb_build_object(
    'submissions', coalesce(v_subs, 0),
    'ready', coalesce(v_ready, 0),
    'partial', coalesce(v_partial, 0),
    'thin', coalesce(v_thin, 0)
  );
  duration_ms := round(extract(milliseconds from clock_timestamp() - t0)::numeric, 1);
  return next;

  -- Étape 4 — la recomposition : ce que le Feed rend, et dans quelles bandes.
  t0 := clock_timestamp();
  select count(*),
         count(*) filter (where f.band = 'priority'),
         count(*) filter (where f.band = 'discovery'),
         max(f.engine_version)
    into v_rows, v_prio, v_disc, v_engine
    from public.intelligence_feed(p_casting) f;

  seq := 4;
  step := 'feed';
  detail := jsonb_build_object(
    'positions', coalesce(v_rows, 0),
    'priority', coalesce(v_prio, 0),
    'discovery', coalesce(v_disc, 0),
    'engine_version', v_engine
  );
  duration_ms := round(extract(milliseconds from clock_timestamp() - t0)::numeric, 1);
  return next;
end;
$$;

comment on function public.intelligence_trace(uuid) is
  'Ce que le moteur fait pour un casting, étape par étape, avec les durées réellement mesurées.';

revoke execute on function public.intelligence_trace(uuid) from anon, public;
grant execute on function public.intelligence_trace(uuid) to authenticated;
