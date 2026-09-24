-- Un retrait de candidature prévient la production.
--
-- Le trigger de notification ignore volontairement les mouvements du comédien
-- (« envoyée », « retirée ») : se notifier soi-même n'a pas de sens. Mais un
-- retrait concerne quelqu'un d'autre — la production compte les candidats, elle
-- doit savoir que celui-là n'est plus dans la course. Sans ça, elle programme un
-- callback avec une personne qui s'est désistée.
--
-- Chaque membre actif de l'organisation est prévenu, comme pour une nouvelle
-- candidature. Le fait canonique correspondant (`APPLICATION_WITHDRAWN`) est
-- déjà écrit par la machine à états ; ceci n'est que l'alerte.

create or replace function public.notify_application_withdrawn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_who     text;
  v_role    text;
  v_project text;
  v_org     uuid;
begin
  if new.status is not distinct from old.status or new.status <> 'withdrawn' then
    return new;
  end if;

  select trim(coalesce(t.professional_name, coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
    into v_who
    from public.profiles p
    left join public.talent_profiles t on t.profile_id = p.id
   where p.id = new.talent_id;

  select r.name, pr.title, pr.org_id
    into v_role, v_project, v_org
    from public.roles r
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects pr on pr.id = c.project_id
   where r.id = new.role_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id,
         'application_status',
         coalesce(nullif(v_who, ''), 'A talent') || ' withdrew their application',
         coalesce(v_role, 'A role') || ' · ' || coalesce(v_project, 'a project'),
         'application',
         new.id
    from public.organization_members m
   where m.org_id = v_org and m.status = 'active';

  return new;
end;
$$;

revoke execute on function public.notify_application_withdrawn() from anon, authenticated, public;

drop trigger if exists applications_notify_withdrawn on public.applications;
create trigger applications_notify_withdrawn
  after update of status on public.applications
  for each row execute function public.notify_application_withdrawn();
