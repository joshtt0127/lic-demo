-- Correctif : `text[] || 'mot'` ne fait pas ce qu'on croit.
--
-- PostgreSQL a deux opérateurs `||` candidats — tableau ‖ élément et
-- tableau ‖ tableau — et devant un littéral sans type il choisit le second :
-- il essaie de lire « description » comme un littéral de tableau, et l'update
-- entier échoue avec `22P02 malformed array literal`. Une modification de
-- casting devenait donc impossible.
--
-- `array_append()` ne laisse aucune ambiguïté. C'est le même code, sans le
-- piège.

create or replace function public.record_casting_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed  text[] := '{}';
  v_notify   boolean := false;
  v_org      uuid;
  v_title    text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.deadline_at is distinct from old.deadline_at then
    v_changed := array_append(v_changed, 'deadline_at');
    v_notify := true;
  end if;
  if new.location is distinct from old.location then
    v_changed := array_append(v_changed, 'location');
    v_notify := true;
  end if;
  if new.title is distinct from old.title then
    v_changed := array_append(v_changed, 'title');
  end if;
  if new.description is distinct from old.description then
    v_changed := array_append(v_changed, 'description');
  end if;
  if new.compensation is distinct from old.compensation then
    v_changed := array_append(v_changed, 'compensation');
  end if;
  if new.visibility is distinct from old.visibility then
    v_changed := array_append(v_changed, 'visibility');
  end if;

  if array_length(v_changed, 1) is null then
    return new;
  end if;

  select p.org_id into v_org from public.projects p where p.id = new.project_id;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, before, after, metadata)
  values (
    'CASTING_UPDATED',
    auth.uid(),
    'casting_call',
    new.id,
    v_org,
    jsonb_build_object('deadline_at', old.deadline_at, 'location', old.location,
                       'title', old.title, 'visibility', old.visibility),
    jsonb_build_object('deadline_at', new.deadline_at, 'location', new.location,
                       'title', new.title, 'visibility', new.visibility),
    jsonb_build_object('changed', to_jsonb(v_changed), 'notified', v_notify)
  );

  if v_notify then
    v_title := coalesce(new.title, 'A casting');
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
    select distinct a.talent_id,
           'casting_updated',
           v_title || ' has changed',
           case
             when new.deadline_at is distinct from old.deadline_at then 'The deadline moved.'
             else 'The location changed.'
           end,
           'casting_call',
           new.id
      from public.applications a
      join public.roles r on r.id = a.role_id
     where r.casting_call_id = new.id
       and a.status not in ('withdrawn', 'not_selected', 'cast');
  end if;

  return new;
end;
$$;

revoke execute on function public.record_casting_update() from anon, authenticated, public;
