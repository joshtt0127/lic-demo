-- DISCOVERY SIGNAL — « cette candidature mérite-t-elle une attention humaine ? »
--
-- La question que ce fichier ne pose PAS : « cette personne a-t-elle du
-- talent ? ». C'est la dérive que le mémo nomme explicitement, et c'est celle
-- vers laquelle tout pousse — demander à un modèle de noter le magnétisme d'un
-- comédien sur une première bande serait faisable, vendeur, et faux.
--
-- La distinction qui rend ce signal légitime tient en une phrase :
--
--   **On évalue la candidature, jamais la personne.**
--
-- Une candidature est un objet : un fichier, un dossier, des critères annoncés
-- en face de critères déclarés. Elle peut être incomplète, illisible, hors
-- sujet — ce sont des faits vérifiables, au même titre qu'un formulaire mal
-- rempli. Un comédien, lui, ne se mesure pas. Un dossier « thin » ne veut pas
-- dire un acteur faible : il veut dire qu'il manque une tape.
--
-- C'est pour ça que la sortie est une **bande** et des **vérifications
-- nommées**, pas une note. `readiness: 'partial'` avec « pas de self-tape » se
-- répare ; `72/100` à côté d'un visage se compare, et devient un classement.
--
-- Ce qui est mesuré, et d'où ça vient :
--
--   · **Dossier complet** — tape, note d'intention, photo. Colonnes existantes.
--   · **Techniquement exploitable** — `tape_checks`, déjà là depuis le contrôle
--     technique des self-tapes : cadrage, lumière, son, durée. Rien de neuf à
--     construire, et surtout rien de subjectif.
--   · **Critères annoncés** — âge de jeu, langues, compétences. Déclarés des
--     deux côtés, donc comparables sans interprétation.
--   · **Écho au brief** — les mots du rôle qu'on retrouve dans la candidature.
--
-- Sur ce dernier point, une honnêteté nécessaire : **c'est un recoupement
-- lexical, pas une compréhension sémantique**. On compte les termes communs
-- entre le brief et ce que le comédien a écrit. Ça attrape « la candidature
-- parle bien de ce rôle », ça rate une reformulation intelligente. Le mémo
-- parle de cohérence sémantique ; la version honnête aujourd'hui s'appelle un
-- écho, et c'est ainsi qu'elle est nommée partout. Le jour où `pgvector` sera
-- activé, cette seule vérification se remplace sans toucher au reste.
--
-- Et aucun appel de modèle par candidature : tout est déterministe. Un signal
-- de découverte qui coûterait un appel d'API par dossier ne serait pas activé
-- sur les gros castings — c'est-à-dire exactement ceux où il sert.

/**
 * Ce qui, dans une candidature, se vérifie sans jugement.
 *
 * `security invoker` (défaut) : sans les policies, une organisation n'a aucune
 * candidature à analyser. Pas de contrôle d'accès à écrire, donc aucun à
 * oublier.
 *
 * Une vérification qui ne peut pas être faite renvoie `null` et **ne compte
 * pas** — même règle que le contrôle technique des tapes. Un rôle qui n'annonce
 * aucune langue ne peut pas produire de candidature « hors langue », et un
 * dossier ne doit jamais être pénalisé pour une exigence que personne n'a
 * formulée.
 */
create or replace function public.discovery_signal(p_casting uuid)
returns table (
  application_id  uuid,
  talent_id       uuid,
  role_id         uuid,
  readiness       text,
  checks          jsonb,
  met             integer,
  applicable      integer,
  engine_version  text
)
language sql
stable
as $$
with cfg as (
  select engine_version from public.intelligence_settings where id
),
base as (
  select
    a.id                as application_id,
    a.talent_id,
    a.role_id,
    a.note,
    a.headshot_id,
    a.showreel_id,
    r.playing_age_min   as role_age_min,
    r.playing_age_max   as role_age_max,
    r.languages         as role_languages,
    r.skills            as role_skills,
    -- Le brief tel qu'il a été écrit, dans l'ordre où le comédien le lit.
    concat_ws(' ', r.name, r.description, r.requirements, r.selftape_instructions, c.description)
                        as brief,
    tp.playing_age_min  as talent_age_min,
    tp.playing_age_max  as talent_age_max,
    concat_ws(' ', a.note, tp.headline, tp.bio) as pitch
  from public.applications a
  join public.roles r         on r.id = a.role_id
  join public.casting_calls c on c.id = r.casting_call_id
  left join public.talent_profiles tp on tp.profile_id = a.talent_id
  where c.id = p_casting
    and a.status <> 'draft'
),
enriched as (
  select
    b.*,
    (select st.id from public.self_tapes st
      where st.application_id = b.application_id
      order by st.submitted_at desc limit 1)          as tape_id,
    coalesce(
      (select array_agg(tl.language) from public.talent_languages tl
        where tl.talent_id = b.talent_id), '{}'::text[]
    )                                                 as talent_languages,
    coalesce(
      (select array_agg(s.name) from public.talent_skills ts
         join public.skills s on s.id = ts.skill_id
        where ts.talent_id = b.talent_id), '{}'::text[]
    )                                                 as talent_skills,
    /**
     * Les mots du brief qu'on retrouve dans la candidature.
     *
     * `simple` plutôt qu'une configuration linguistique : le produit est
     * bilingue, et un `french` appliqué à un brief anglais découperait mal.
     * Les termes de moins de quatre lettres sont écartés — sans ça, « the »,
     * « les » et « une » font un écho parfait avec n'importe quoi.
     */
    (
      select count(*)::int
      from (
        select lexeme from unnest(to_tsvector('simple', coalesce(b.brief, ''))) where length(lexeme) >= 4
        intersect
        select lexeme from unnest(to_tsvector('simple', coalesce(b.pitch, ''))) where length(lexeme) >= 4
      ) shared
    )                                                 as brief_terms_echoed,
    (
      select count(*)::int
      from (
        select lexeme from unnest(to_tsvector('simple', coalesce(b.brief, ''))) where length(lexeme) >= 4
      ) terms
    )                                                 as brief_terms_total
  from base b
),
judged as (
  select
    e.*,
    tc.score                                          as tape_score,
    tc.has_audio,
    (e.tape_id is not null)                           as has_tape,
    (e.note is not null and length(btrim(e.note)) >= 40) as has_note,
    (e.headshot_id is not null)                       as has_headshot,
    -- Chaque vérification : true, false, ou null quand elle ne s'applique pas.
    case
      when e.role_age_min is null or e.role_age_max is null then null
      when e.talent_age_min is null or e.talent_age_max is null then null
      else not (e.talent_age_max < e.role_age_min or e.talent_age_min > e.role_age_max)
    end                                               as age_fits,
    case
      when coalesce(array_length(e.role_languages, 1), 0) = 0 then null
      when coalesce(array_length(e.talent_languages, 1), 0) = 0 then false
      else e.talent_languages && e.role_languages
    end                                               as languages_fit,
    case
      when coalesce(array_length(e.role_skills, 1), 0) = 0 then null
      when coalesce(array_length(e.talent_skills, 1), 0) = 0 then false
      else e.talent_skills && e.role_skills
    end                                               as skills_fit,
    case
      when e.brief_terms_total < 5 then null -- Un brief trop court ne prouve rien.
      when coalesce(length(btrim(e.pitch)), 0) = 0 then false
      else e.brief_terms_echoed >= 3
    end                                               as brief_echoed
  from enriched e
  left join public.tape_checks tc on tc.self_tape_id = e.tape_id
),
scored as (
  select
    j.*,
    case
      when j.tape_id is null then null
      when j.tape_score is null then null -- Envoyée avant le contrôle technique.
      else j.tape_score >= 60
    end as tape_usable
  from judged j
)
select
  s.application_id,
  s.talent_id,
  s.role_id,
  /**
   * Trois états, sur le dossier — jamais sur la personne.
   *
   * `ready`   : il y a une tape exploitable et rien d'annoncé n'est contredit.
   * `partial` : il manque quelque chose, ou un critère annoncé ne colle pas.
   * `thin`    : pas de tape et pas de quoi se faire un avis.
   */
  case
    when not s.has_tape and not (s.has_note and s.has_headshot) then 'thin'
    when s.has_tape
      and coalesce(s.tape_usable, true)
      and coalesce(s.age_fits, true)
      and coalesce(s.languages_fit, true)                        then 'ready'
    else 'partial'
  end as readiness,
  (
    select coalesce(jsonb_agg(jsonb_build_object('code', code, 'ok', ok, 'detail', detail)), '[]'::jsonb)
    from (values
      ('self_tape',   s.has_tape,      to_jsonb(s.tape_id)),
      ('tape_usable', s.tape_usable,   to_jsonb(s.tape_score)),
      ('has_audio',   s.has_audio,     null::jsonb),
      ('note',        s.has_note,      null::jsonb),
      ('headshot',    s.has_headshot,  null::jsonb),
      ('age_fits',    s.age_fits,      jsonb_build_object('role', jsonb_build_array(s.role_age_min, s.role_age_max),
                                                          'talent', jsonb_build_array(s.talent_age_min, s.talent_age_max))),
      ('languages_fit', s.languages_fit, to_jsonb(s.role_languages)),
      ('skills_fit',  s.skills_fit,    to_jsonb(s.role_skills)),
      ('brief_echoed', s.brief_echoed, jsonb_build_object('echoed', s.brief_terms_echoed, 'total', s.brief_terms_total))
    ) as t(code, ok, detail)
  ) as checks,
  -- Ce qui est vérifié et tenu, sur ce qui était vérifiable. Deux compteurs
  -- plutôt qu'un pourcentage : « 5 sur 7 » se lit et se répare, « 71 % » se
  -- compare d'une personne à l'autre.
  (
    (s.has_tape)::int + (s.has_note)::int + (s.has_headshot)::int
    + coalesce(s.tape_usable::int, 0) + coalesce(s.age_fits::int, 0)
    + coalesce(s.languages_fit::int, 0) + coalesce(s.skills_fit::int, 0)
    + coalesce(s.brief_echoed::int, 0)
  ) as met,
  (
    3 + (s.tape_usable is not null)::int + (s.age_fits is not null)::int
    + (s.languages_fit is not null)::int + (s.skills_fit is not null)::int
    + (s.brief_echoed is not null)::int
  ) as applicable,
  (select engine_version from cfg)
from scored s;
$$;

comment on function public.discovery_signal(uuid) is
  'Discovery Signal — ce qui se vérifie dans une candidature sans jugement. Évalue le dossier, jamais la personne.';

revoke execute on function public.discovery_signal(uuid) from anon, public;
grant execute on function public.discovery_signal(uuid) to authenticated;
