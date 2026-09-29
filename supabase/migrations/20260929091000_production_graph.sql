-- PRODUCTION GRAPH™ — ce que les décisions révèlent, pas ce que le brief annonce.
--
-- La couche mémoire d'origine comptait les décisions d'une organisation : combien
-- de candidatures vues, en combien de temps, combien retenues. Utile pour
-- calibrer, mais ça ne dit rien de ce que le mémo appelle le cœur du sujet :
--
--   « Pas ce que la production dit rechercher.
--     Ce que ses décisions révèlent de ce qu'elle valorise réellement. »
--
-- La différence entre les deux est mesurable, et c'est tout l'intérêt. Un rôle
-- annonce « 25–35 ans ». L'équipe shortliste des comédiens dont l'âge de jeu
-- déclaré va de 30 à 42. Personne n'a menti : le brief a été écrit avant d'avoir
-- vu qui que ce soit, et les décisions, elles, se prennent devant des visages.
-- L'écart entre le critère écrit et le critère appliqué est une information que
-- l'équipe elle-même ne possède pas — elle ne s'en rend pas compte.
--
-- Ce qu'on mesure ici, et pourquoi c'est limité à ça :
--
--   · **L'âge de jeu** — le seul critère à la fois déclaré sur le rôle et
--     déclaré sur le profil, donc le seul comparable sans interprétation.
--   · **Les langues** — déclarées des deux côtés, en codes, donc comparables.
--   · **Le niveau d'expérience et le type de rôle** — pas de critère déclaré en
--     face, donc rendus comme une répartition, pas comme un écart.
--
-- Ce qu'on **ne** mesure **pas**, volontairement : le genre, l'origine, la
-- nationalité. Ces colonnes existent, et un « votre équipe shortliste à 70 % des
-- profils de tel type » serait techniquement facile à produire. Ce serait aussi
-- une statistique que personne ne peut lire sans qu'elle devienne une consigne —
-- et transformer une observation en consigne de casting sur l'origine ou le
-- genre est exactement ce qu'un outil ne doit jamais faire. Le jour où une
-- production veut auditer ses propres biais, ça se fait avec un cadre, un
-- consentement et un juriste, pas dans un tableau de bord par défaut.

/**
 * Le comportement de sélection d'une organisation, tel que ses décisions le
 * révèlent.
 *
 * `security_invoker` : les policies de `applications` ne laissent voir à une
 * organisation que ses propres candidatures, donc la vue est cloisonnée sans
 * qu'aucun filtre n'ait à être écrit — et sans qu'un développeur puisse
 * l'oublier plus tard. Contrairement au Talent Graph, il n'y a ici rien à
 * partager entre productions : la logique de sélection d'une maison est son
 * actif le plus intime.
 */
create or replace view public.v_production_graph
with (security_invoker = true) as
with picked as (
  select
    p.org_id,
    a.id                    as application_id,
    a.talent_id,
    r.role_type,
    r.playing_age_min       as role_age_min,
    r.playing_age_max       as role_age_max,
    r.languages             as role_languages,
    tp.playing_age_min      as talent_age_min,
    tp.playing_age_max      as talent_age_max,
    tp.experience_level,
    coalesce(
      (select array_agg(tl.language order by tl.language)
         from public.talent_languages tl where tl.talent_id = a.talent_id),
      '{}'::text[]
    )                       as talent_languages
  from public.applications a
  join public.roles r         on r.id = a.role_id
  join public.casting_calls c on c.id = r.casting_call_id
  join public.projects p      on p.id = c.project_id
  left join public.talent_profiles tp on tp.profile_id = a.talent_id
  -- Ce que l'équipe a *retenu*, pas ce qu'elle a reçu : c'est le geste qui
  -- révèle quelque chose, pas la candidature.
  where a.status in ('shortlisted', 'callback', 'offer', 'cast')
),
age as (
  select
    org_id,
    count(*) filter (
      where role_age_min is not null and role_age_max is not null
        and talent_age_min is not null and talent_age_max is not null
    ) as comparable,
    -- « Hors critère » = les deux fourchettes ne se recouvrent pas du tout.
    -- Pas « le talent est plus vieux que le maximum » : un comédien qui joue
    -- 30–42 pour un rôle 25–35 est dans la cible, il la déborde seulement.
    count(*) filter (
      where role_age_min is not null and role_age_max is not null
        and talent_age_min is not null and talent_age_max is not null
        and (talent_age_max < role_age_min or talent_age_min > role_age_max)
    ) as outside,
    percentile_cont(0.5) within group (
      order by (talent_age_min + talent_age_max) / 2.0
    ) filter (where talent_age_min is not null and talent_age_max is not null)
      as revealed_age_median,
    percentile_cont(0.5) within group (
      order by (role_age_min + role_age_max) / 2.0
    ) filter (where role_age_min is not null and role_age_max is not null)
      as declared_age_median
  from picked
  group by org_id
),
languages as (
  -- Une langue retenue qui n'était pas demandée n'est pas une erreur : c'est
  -- souvent le signe d'un rôle dont le brief était plus étroit que l'intention.
  select
    org_id,
    count(*)                                                  as decisions,
    count(*) filter (where talent_languages && role_languages) as matched,
    count(*) filter (
      where array_length(role_languages, 1) > 0
        and not (talent_languages && role_languages)
    )                                                          as unmatched
  from picked
  group by org_id
),
mix as (
  select
    org_id,
    jsonb_object_agg(kind, tally) filter (where scope = 'experience') as experience_mix,
    jsonb_object_agg(kind, tally) filter (where scope = 'role_type')  as role_type_mix
  from (
    select org_id, 'experience' as scope, coalesce(experience_level, 'unstated') as kind, count(*) as tally
      from picked group by org_id, coalesce(experience_level, 'unstated')
    union all
    select org_id, 'role_type', coalesce(role_type::text, 'unstated'), count(*)
      from picked group by org_id, coalesce(role_type::text, 'unstated')
  ) t
  group by org_id
)
select
  a.org_id,
  l.decisions                                       as decisions_observed,
  a.comparable                                      as age_comparable,
  a.declared_age_median,
  a.revealed_age_median,
  /** L'écart entre le critère écrit et le critère appliqué, en années. */
  round((a.revealed_age_median - a.declared_age_median)::numeric, 1) as age_drift,
  /** Part des profils retenus dont l'âge de jeu ne recoupe pas le rôle annoncé. */
  round(a.outside::numeric / nullif(a.comparable, 0), 3)  as outside_declared_age_rate,
  round(l.unmatched::numeric / nullif(l.decisions, 0), 3) as language_mismatch_rate,
  coalesce(m.experience_mix, '{}'::jsonb)           as experience_mix,
  coalesce(m.role_type_mix, '{}'::jsonb)            as role_type_mix
from age a
join languages l on l.org_id = a.org_id
left join mix m  on m.org_id = a.org_id;

comment on view public.v_production_graph is
  'Production Graph™ — l''écart entre les critères déclarés d''une organisation et ceux que ses décisions appliquent.';

revoke all on public.v_production_graph from anon, public;
grant select on public.v_production_graph to authenticated;
