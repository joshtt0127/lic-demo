-- INTELLIGENCE — 1. La couche signal.
--
-- Décision d'architecture, prise après audit : **on ne crée pas de nouveau
-- magasin de signaux**. `public.events` en est déjà un — 2 000 faits, 15 types,
-- chacun avec son acteur, son sujet, son organisation, son avant/après et son
-- horodatage. Une « table signals » à côté serait la même donnée deux fois, et
-- deux vérités qui divergent au premier bug.
--
-- Ce qui manque n'est pas un magasin, c'est **ce que le produit ne capture pas
-- encore** : l'attention. Ouvrir une candidature, regarder une tape, la
-- regarder jusqu'au bout, y revenir — ce sont les gestes qui disent où va
-- l'attention d'une équipe, et ils ne laissaient aucune trace.
--
-- Et une vue, `v_casting_signals`, qui donne à chaque fait son contexte complet
-- (talent × rôle × casting × production × temps). C'est *ça*, la couche signal :
-- pas un stockage de plus, une lecture contextualisée de ce qui existe.
--
-- Ce que cette migration ne fait pas, volontairement : mesurer les gens. On
-- enregistre qu'une tape a été regardée à 80 %, pas ce que ça dit du comédien.

-- ── Ce que l'attention laisse comme trace ─────────────────────────────────

/**
 * Les gestes de revue, enregistrés depuis l'interface.
 *
 * `security definer` avec vérification d'appartenance : seul un membre de
 * l'organisation qui reçoit la candidature peut déclarer l'avoir regardée. Sans
 * ce garde, n'importe qui pourrait fabriquer de l'attention — et l'attention
 * fabriquée est exactement ce qui empoisonnerait la mémoire.
 *
 * `p_progress` : la fraction de la tape réellement vue (0 → 1), quand elle a du
 * sens. C'est une mesure de **notre** attention, pas une note du comédien.
 */
create or replace function public.record_review_engagement(
  p_application uuid,
  p_kind text,
  p_progress numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_talent uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  if p_kind not in ('AUDITION_OPENED', 'AUDITION_VIEWED', 'AUDITION_COMPLETED', 'AUDITION_REWATCHED') then
    raise exception 'Unknown engagement %', p_kind using errcode = '22023';
  end if;

  select public.application_org_id(a.id), a.talent_id
    into v_org, v_talent
    from public.applications a
   where a.id = p_application;

  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'Not your candidate' using errcode = '42501';
  end if;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, source, metadata)
  values (
    p_kind, auth.uid(), 'application', p_application, v_org, v_talent, 'app',
    case when p_progress is null then '{}'::jsonb
         else jsonb_build_object('progress', round(greatest(0, least(1, p_progress))::numeric, 2)) end
  );
end;
$$;

revoke execute on function public.record_review_engagement(uuid, text, numeric) from anon, public;
grant execute on function public.record_review_engagement(uuid, text, numeric) to authenticated;

/** Consulter le profil d'un comédien depuis l'espace production. */
create or replace function public.record_profile_view(p_talent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null or p_talent = auth.uid() then
    return;
  end if;

  select m.org_id into v_org
    from public.organization_members m
   where m.profile_id = auth.uid() and m.status = 'active'
   order by m.created_at
   limit 1;

  if v_org is null then
    return; -- Un comédien qui regarde un profil ne produit aucun signal métier.
  end if;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, source)
  values ('PROFILE_VIEWED', auth.uid(), 'profile', p_talent, v_org, p_talent, 'app');
end;
$$;

revoke execute on function public.record_profile_view(uuid) from anon, public;
grant execute on function public.record_profile_view(uuid) to authenticated;

-- ── Le contexte complet de chaque fait ────────────────────────────────────

create index if not exists events_subject_type_idx
  on public.events (subject_id, type, occurred_at desc);
create index if not exists events_org_type_idx
  on public.events (org_id, type, occurred_at desc);

/**
 * Chaque fait, replacé dans son contexte de casting.
 *
 * L'unité de compréhension du produit n'est pas « un talent » ni « une
 * décision » : c'est **talent × rôle × casting × production × temps**. Un PASS
 * n'est pas un jugement universel, c'est un non pour *ce* rôle, *ce* jour-là.
 * Cette vue est l'endroit où cette règle devient structurelle plutôt que
 * déclarative.
 *
 * `security_invoker` : elle ne donne accès à rien de plus que les policies des
 * tables qu'elle lit.
 */
create or replace view public.v_casting_signals
with (security_invoker = true) as
  select
    e.id,
    e.type,
    e.occurred_at,
    e.actor_id,
    e.subject_id                as talent_id,
    e.org_id,
    e.metadata,
    a.id                        as application_id,
    a.status                    as application_status,
    r.id                        as role_id,
    r.name                      as role_name,
    r.role_type,
    r.playing_age_min,
    r.playing_age_max,
    c.id                        as casting_call_id,
    c.title                     as casting_title,
    p.id                        as project_id,
    p.production_type
  from public.events e
  left join public.applications a
    on e.entity_type = 'application' and a.id = e.entity_id
  left join public.roles r on r.id = a.role_id
  left join public.casting_calls c on c.id = r.casting_call_id
  left join public.projects p on p.id = c.project_id
 where e.subject_id is not null;

comment on view public.v_casting_signals is
  'Chaque fait avec son contexte : talent × rôle × casting × production × temps.';

revoke all on public.v_casting_signals from anon, public;
grant select on public.v_casting_signals to authenticated;
