-- Live messaging and live badges.
--
-- Without this, an unread badge only updates when React Query happens to
-- refetch: the number is right on load and wrong a minute later. Adding these
-- tables to the realtime publication lets each client hear about the rows it is
-- already allowed to read (Realtime applies the same RLS policies), so the badge
-- and the open thread update as the message lands.
--
-- `replica identity full` is what makes the old row available on UPDATE, which
-- is how a client sees "this notification was read" rather than just "something
-- changed".

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end
$$;

alter table public.messages             replica identity full;
alter table public.notifications        replica identity full;
alter table public.conversation_members replica identity full;
