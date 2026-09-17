-- Notifications, produced by the database.
--
-- The client never inserts a notification (no policy allows it): rows are
-- created by these security-definer triggers, so a notification can only exist
-- because something really happened.
--
--  · a talent submits  → every active member of the receiving organization
--  · a status changes  → the talent whose application it is
--  · a message is sent → every other member of the conversation

create or replace function public.notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text;
  v_project text;
  v_talent text;
begin
  -- Only once the application actually reaches the production side.
  if new.status = 'draft' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return new;
  end if;

  select p.org_id, r.name, p.title,
         coalesce(nullif(tp.professional_name, ''),
                  trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')))
    into v_org, v_role, v_project, v_talent
    from public.roles r
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p on p.id = c.project_id
    join public.profiles pr on pr.id = new.talent_id
    left join public.talent_profiles tp on tp.profile_id = new.talent_id
   where r.id = new.role_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id,
         'new_application',
         'New application',
         coalesce(v_talent, 'A talent') || ' applied for ' || v_role || ' — ' || v_project,
         'application',
         new.id
    from public.organization_members m
   where m.org_id = v_org
     and m.status = 'active'
     and m.profile_id <> new.talent_id;

  return new;
end;
$$;

create trigger applications_notify_new
  after insert or update of status on public.applications
  for each row execute function public.notify_new_application();

create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_project text;
  v_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- The talent's own moves (submit / withdraw) do not need an alert.
  if new.status in ('draft', 'submitted', 'withdrawn') then
    return new;
  end if;

  select r.name, p.title into v_role, v_project
    from public.roles r
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p on p.id = c.project_id
   where r.id = new.role_id;

  v_label := replace(new.status::text, '_', ' ');

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  values (
    new.talent_id,
    'application_status',
    'Audition update',
    v_project || ' — ' || v_role || ': ' || v_label,
    'application',
    new.id
  );

  return new;
end;
$$;

create trigger applications_notify_status
  after update of status on public.applications
  for each row execute function public.notify_application_status();

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_subject text;
begin
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_sender
    from public.profiles where id = new.sender_id;

  select subject into v_subject from public.conversations where id = new.conversation_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select cm.profile_id,
         'message',
         'New message from ' || coalesce(nullif(v_sender, ''), 'a teammate'),
         left(new.body, 140),
         'conversation',
         new.conversation_id
    from public.conversation_members cm
   where cm.conversation_id = new.conversation_id
     and cm.profile_id <> new.sender_id;

  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

comment on table public.notifications is
  'Written only by database triggers — a row means a real event occurred.';
