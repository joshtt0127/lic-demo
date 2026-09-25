-- INTELLIGENCE — 2. La mémoire : Talent Graph & Production Graph.
--
-- Deux vues dérivées, aucune table. La mémoire n'est pas un second stockage
-- qu'il faudrait tenir à jour : c'est **une lecture agrégée des faits**. Une
-- table de synthèse serait fausse le jour où un événement arrive en retard, où
-- un compte est anonymisé, où une candidature est retirée.
--
-- La décision d'architecture qui compte ici :
--
--   **La mémoire est strictement cloisonnée par organisation.**
--
-- Rien dans ces vues n'agrège le comportement de plusieurs productions sur un
-- même comédien. Ce serait techniquement trivial — et ce serait exactement le
-- score universel que le produit refuse. « Retenu par 4 productions » deviendrait
-- en une semaine le tri par défaut de tout le monde : un classement des gens,
-- écrit par accident, avec la mise en page d'une statistique neutre.
--
-- Ce qu'une production se rappelle, c'est donc **sa propre histoire** avec un
-- comédien : qui elle a déjà vu, retenu, rappelé, écarté, et quand. Un PASS chez
-- l'une n'existe pas chez l'autre. Un comédien inconnu ici reste inconnu ici,
-- même s'il tourne ailleurs — et c'est la couche découverte, pas la mémoire, qui
-- le fait remonter.

-- ── Ce que l'attention ne doit pas dire au comédien ───────────────────────
--
-- La couche signal vient de créer une donnée qui n'existait pas : combien de
-- fois une équipe a ouvert une tape, l'a regardée en entier, y est revenue.
-- C'est une donnée de délibération. La rendre lisible au comédien, ce serait
-- rejouer le « vu à 21 h 14 » des messageries sur une décision de carrière :
-- une production hésiterait à revoir une tape de peur du signal envoyé, et un
-- comédien lirait un rappel dans un simple clic.
--
-- La policy de lecture se resserre donc : le sujet garde accès aux faits qui le
-- concernent — candidature, décision, rappel — et **pas** aux gestes de revue.
-- L'export RGPD suit la même règle, pour la même raison (article 4 : ce sont
-- les données de délibération d'un tiers).

create or replace function public.is_internal_attention(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'PROFILE_VIEWED', 'AUDITION_OPENED', 'AUDITION_VIEWED',
    'AUDITION_COMPLETED', 'AUDITION_REWATCHED'
  );
$$;

comment on function public.is_internal_attention(text) is
  'Gestes de revue : visibles de l''organisation seule, jamais du comédien.';

drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select to authenticated
  using (
    (subject_id = auth.uid() and not public.is_internal_attention(type))
    or (org_id is not null and public.is_org_member(org_id))
  );

/** L'export rend les faits du parcours, pas la délibération des productions. */
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'talent_profile', (
      select to_jsonb(t) from public.talent_profiles t where t.profile_id = auth.uid()
    ),
    'consents', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.granted_at)
        from public.consents c where c.profile_id = auth.uid()
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
        from public.applications a where a.talent_id = auth.uid()
    ), '[]'::jsonb),
    'self_tapes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'application_id', st.application_id,
               'submitted_at', st.submitted_at, 'duration_s', st.duration_s,
               'file', jsonb_build_object('bucket', m.bucket, 'path', m.path, 'bytes', m.bytes)
             ) order by st.submitted_at)
        from public.self_tapes st
        join public.applications a on a.id = st.application_id
        left join public.media_assets m on m.id = st.media_asset_id
       where a.talent_id = auth.uid()
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
        from public.media_assets m where m.owner_id = auth.uid()
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.created_at)
        from public.posts po where po.author_id = auth.uid()
    ), '[]'::jsonb),
    'messages_sent', coalesce((
      select jsonb_agg(jsonb_build_object('id', ms.id, 'body', ms.body, 'created_at', ms.created_at)
             order by ms.created_at)
        from public.messages ms where ms.sender_id = auth.uid()
    ), '[]'::jsonb),
    'events_about_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.type, 'occurred_at', e.occurred_at,
               'before', e.before, 'after', e.after
             ) order by e.occurred_at)
        from public.events e
       where e.subject_id = auth.uid()
         and not public.is_internal_attention(e.type)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.export_my_data() from anon, public;
grant execute on function public.export_my_data() to authenticated;

-- ── Talent Graph : ce que *cette* production se rappelle d'un comédien ────

/**
 * Une ligne par (comédien × organisation). Des faits comptés, jamais une note.
 *
 * `security_invoker` fait tout le cloisonnement : les policies de `applications`
 * et de `events` ne laissent passer que les lignes de l'organisation dont on est
 * membre. Il n'existe donc aucune requête, depuis l'application, qui rende la
 * mémoire d'une production à une autre — ce n'est pas un filtre qu'un futur
 * développeur peut oublier de mettre, c'est la seule chose que la base accepte
 * de répondre.
 */
create or replace view public.v_talent_memory
with (security_invoker = true) as
with app as (
  select
    a.talent_id,
    p.org_id,
    a.id          as application_id,
    a.status,
    a.created_at,
    a.decided_at,
    r.role_type
  from public.applications a
  join public.roles r         on r.id = a.role_id
  join public.casting_calls c on c.id = r.casting_call_id
  join public.projects p      on p.id = c.project_id
  where a.status <> 'draft'
),
history as (
  select
    talent_id,
    org_id,
    count(*)                                                     as applications,
    count(*) filter (where status in ('shortlisted', 'callback', 'offer', 'cast')) as shortlisted,
    count(*) filter (where status in ('callback', 'offer', 'cast'))                as callbacks,
    count(*) filter (where status = 'cast')                      as cast_in,
    count(*) filter (where status = 'not_selected')              as passed,
    count(*) filter (where status = 'withdrawn')                 as withdrawn,
    min(created_at)                                              as first_application_at,
    max(created_at)                                              as last_application_at,
    max(decided_at)                                              as last_decision_at,
    array_agg(distinct role_type::text)                          as role_types
  from app
  group by talent_id, org_id
),
attention as (
  select
    e.subject_id as talent_id,
    e.org_id,
    count(*) filter (where e.type = 'PROFILE_VIEWED')      as profile_views,
    count(*) filter (where e.type = 'AUDITION_OPENED')     as tape_opens,
    count(*) filter (where e.type = 'AUDITION_COMPLETED')  as tape_completions,
    count(*) filter (where e.type = 'AUDITION_REWATCHED')  as tape_rewatches,
    max(e.occurred_at)                                     as last_attention_at
  from public.events e
  where e.org_id is not null
    and e.subject_id is not null
    and public.is_internal_attention(e.type)
  group by e.subject_id, e.org_id
)
select
  h.talent_id,
  h.org_id,
  h.applications,
  h.shortlisted,
  h.callbacks,
  h.cast_in,
  h.passed,
  h.withdrawn,
  h.first_application_at,
  h.last_application_at,
  h.last_decision_at,
  h.role_types,
  coalesce(at.profile_views, 0)     as profile_views,
  coalesce(at.tape_opens, 0)        as tape_opens,
  coalesce(at.tape_completions, 0)  as tape_completions,
  coalesce(at.tape_rewatches, 0)    as tape_rewatches,
  at.last_attention_at,
  /**
   * « Connu ici » : cette production a déjà une histoire avec ce comédien —
   * elle l'a retenu, rappelé, ou distribué au moins une fois. Volontairement
   * binaire et sans seuil pondéré : dès qu'un nombre continu existe, quelqu'un
   * finit par trier dessus.
   */
  (h.shortlisted > 0 or h.callbacks > 0 or h.cast_in > 0) as known_here
from history h
left join attention at
  on at.talent_id = h.talent_id and at.org_id = h.org_id;

comment on view public.v_talent_memory is
  'Talent Graph — ce qu''une organisation se rappelle d''un comédien. Strictement cloisonné : aucune agrégation inter-productions.';

revoke all on public.v_talent_memory from anon, public;
grant select on public.v_talent_memory to authenticated;

-- ── Production Graph : ce qu'une production fait, vraiment ────────────────

/**
 * Le comportement observé d'une organisation : ce qu'elle regarde, combien de
 * temps elle met à décider, ce qu'elle finit par retenir.
 *
 * L'usage n'est pas de juger l'équipe — c'est de **calibrer l'attention**. Une
 * production qui a déjà revu 90 % de ses candidatures n'a pas besoin qu'on lui
 * remonte « 12 profils non vus » ; une production qui décide en deux jours n'a
 * pas le même seuil de « ça traîne » qu'une autre qui met trois semaines.
 * Sans cette calibration, le feed dirait la même chose à tout le monde, donc
 * rien à personne.
 */
create or replace view public.v_production_memory
with (security_invoker = true) as
with app as (
  select
    p.org_id,
    a.id      as application_id,
    a.talent_id,
    a.status,
    a.created_at,
    a.viewed_at,
    a.decided_at,
    r.role_type
  from public.applications a
  join public.roles r         on r.id = a.role_id
  join public.casting_calls c on c.id = r.casting_call_id
  join public.projects p      on p.id = c.project_id
  where a.status <> 'draft'
),
/** Agrégé à part : Postgres refuse un `count()` dans un `jsonb_object_agg()`. */
by_role_type as (
  select
    org_id,
    jsonb_object_agg(role_type::text, shortlisted) as shortlisted_by_role_type
  from (
    select
      org_id,
      role_type,
      count(*) filter (where status in ('shortlisted', 'callback', 'offer', 'cast')) as shortlisted
    from app
    where role_type is not null
    group by org_id, role_type
  ) t
  group by org_id
)
select
  a.org_id,
  count(*)                                          as applications_seen,
  count(distinct a.talent_id)                       as talents_seen,
  count(*) filter (where a.viewed_at is not null)   as applications_reviewed,
  count(*) filter (where a.decided_at is not null)  as applications_decided,
  count(*) filter (where a.status in ('shortlisted', 'callback', 'offer', 'cast')) as shortlisted,
  count(*) filter (where a.status = 'cast')         as cast_total,
  /** Le rythme réel de l'équipe, pas celui qu'elle croit avoir. */
  percentile_cont(0.5) within group (
    order by extract(epoch from (a.viewed_at - a.created_at)) / 3600
  ) filter (where a.viewed_at is not null)          as median_hours_to_first_view,
  percentile_cont(0.5) within group (
    order by extract(epoch from (a.decided_at - a.created_at)) / 3600
  ) filter (where a.decided_at is not null)         as median_hours_to_decision,
  /** Part des candidatures déjà regardées — le seuil de « ça traîne » de l'équipe. */
  round(
    count(*) filter (where a.viewed_at is not null)::numeric
      / nullif(count(*), 0), 3
  )                                                 as review_coverage,
  /** Ce qu'elle retient, par type de rôle : un fait de casting, pas un profil type. */
  coalesce(b.shortlisted_by_role_type, '{}'::jsonb) as shortlisted_by_role_type
from app a
left join by_role_type b on b.org_id = a.org_id
group by a.org_id, b.shortlisted_by_role_type;

comment on view public.v_production_memory is
  'Production Graph — le comportement observé d''une organisation, pour calibrer l''attention du feed.';

revoke all on public.v_production_memory from anon, public;
grant select on public.v_production_memory to authenticated;
