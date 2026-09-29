-- L'histoire d'une production redevient lisible par elle.
--
-- Constat, en branchant le Signal Stream : sur 2 248 faits enregistrés, **2 246
-- n'avaient plus d'organisation**. La policy de lecture de `events` étant
-- org-scopée, une équipe de casting ne pouvait relire aucun de ses propres
-- événements — ni dans le flux en direct, ni ailleurs. Le widget affichait
-- « rien », et il avait raison.
--
-- La cause n'est pas le trigger, qui renseigne bien `org_id` (vérifié en
-- transaction annulée sur une vraie insertion). C'est la contrainte :
--
--     events_org_id_fkey ... on delete set null
--
-- À chaque exécution de la suite E2E, le teardown supprime les organisations de
-- test — et Postgres vide consciencieusement l'`org_id` de tous leurs
-- événements. Des centaines d'exécutions plus tard, il ne restait presque rien.
--
-- `on delete set null` reste le bon comportement : quand une organisation
-- disparaît, le fait daté doit survivre — c'est aussi l'histoire du comédien —
-- mais il n'a plus de propriétaire pour le lire, et c'est cohérent. Le problème
-- n'est donc pas la règle, c'est qu'on ne reconstruit jamais ce qui *peut*
-- l'être : un événement dont l'entité existe encore appartient toujours à
-- l'organisation de cette entité.
--
-- Cette migration rattache donc chaque événement orphelin à l'organisation de
-- son entité, quand elle existe encore. Ce qui ne peut pas être retrouvé reste
-- `null` : on ne devine pas une appartenance.

-- ── Les candidatures, et tout ce qui en dépend ────────────────────────────

update public.events e
   set org_id = sub.org_id
  from (
    select a.id as application_id, p.org_id
      from public.applications a
      join public.roles r         on r.id = a.role_id
      join public.casting_calls c on c.id = r.casting_call_id
      join public.projects p      on p.id = c.project_id
  ) sub
 where e.org_id is null
   and e.entity_type = 'application'
   and e.entity_id = sub.application_id;

update public.events e
   set org_id = sub.org_id
  from (
    select st.id as tape_id, p.org_id
      from public.self_tapes st
      join public.applications a  on a.id = st.application_id
      join public.roles r         on r.id = a.role_id
      join public.casting_calls c on c.id = r.casting_call_id
      join public.projects p      on p.id = c.project_id
  ) sub
 where e.org_id is null
   and e.entity_type = 'self_tape'
   and e.entity_id = sub.tape_id;

update public.events e
   set org_id = sub.org_id
  from (
    select cb.id as callback_id, p.org_id
      from public.callbacks cb
      join public.applications a  on a.id = cb.application_id
      join public.roles r         on r.id = a.role_id
      join public.casting_calls c on c.id = r.casting_call_id
      join public.projects p      on p.id = c.project_id
  ) sub
 where e.org_id is null
   and e.entity_type = 'callback'
   and e.entity_id = sub.callback_id;

-- ── Les objets de production ──────────────────────────────────────────────

update public.events e
   set org_id = sub.org_id
  from (
    select c.id as casting_id, p.org_id
      from public.casting_calls c
      join public.projects p on p.id = c.project_id
  ) sub
 where e.org_id is null
   and e.entity_type = 'casting_call'
   and e.entity_id = sub.casting_id;

update public.events e
   set org_id = sub.org_id
  from (
    select r.id as role_id, p.org_id
      from public.roles r
      join public.casting_calls c on c.id = r.casting_call_id
      join public.projects p      on p.id = c.project_id
  ) sub
 where e.org_id is null
   and e.entity_type = 'role'
   and e.entity_id = sub.role_id;

-- ── Ne plus laisser le trou se recreuser ──────────────────────────────────

/**
 * Rattache un événement à l'organisation de son entité, au moment de l'écriture.
 *
 * Les triggers métier renseignent déjà `org_id` — celui-ci n'est donc pas leur
 * doublon mais leur **filet**. Il existe six fonctions qui écrivent dans
 * `events`, et il s'en ajoutera d'autres ; compter sur le fait que chacune
 * pense à l'organisation, c'est accepter que la prochaine l'oublie, et que le
 * trou ne se voie que des mois plus tard en regardant un flux vide.
 *
 * `before insert` et uniquement quand la colonne est vide : un appelant qui
 * sait mieux garde la main.
 */
create or replace function public.fill_event_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is not null then
    return new;
  end if;

  new.org_id := case new.entity_type
    when 'application' then (
      select p.org_id from public.applications a
        join public.roles r on r.id = a.role_id
        join public.casting_calls c on c.id = r.casting_call_id
        join public.projects p on p.id = c.project_id
       where a.id = new.entity_id
    )
    when 'self_tape' then (
      select p.org_id from public.self_tapes st
        join public.applications a on a.id = st.application_id
        join public.roles r on r.id = a.role_id
        join public.casting_calls c on c.id = r.casting_call_id
        join public.projects p on p.id = c.project_id
       where st.id = new.entity_id
    )
    when 'callback' then (
      select p.org_id from public.callbacks cb
        join public.applications a on a.id = cb.application_id
        join public.roles r on r.id = a.role_id
        join public.casting_calls c on c.id = r.casting_call_id
        join public.projects p on p.id = c.project_id
       where cb.id = new.entity_id
    )
    when 'casting_call' then (
      select p.org_id from public.casting_calls c
        join public.projects p on p.id = c.project_id
       where c.id = new.entity_id
    )
    when 'role' then (
      select p.org_id from public.roles r
        join public.casting_calls c on c.id = r.casting_call_id
        join public.projects p on p.id = c.project_id
       where r.id = new.entity_id
    )
    else null
  end;

  return new;
end;
$$;

revoke execute on function public.fill_event_org() from anon, authenticated, public;

drop trigger if exists events_fill_org on public.events;
create trigger events_fill_org
  before insert on public.events
  for each row execute function public.fill_event_org();

comment on function public.fill_event_org() is
  'Filet : rattache un événement à l''organisation de son entité quand l''appelant ne l''a pas fait.';
