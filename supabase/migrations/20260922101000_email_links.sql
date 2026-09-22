-- The notification types are `new_application`, `application_status` and
-- `message` — the first draft of the email templates branched on `new_message`,
-- so a message email fell back to the generic "Open Let It Cast" button instead
-- of linking to the thread. Caught by reading the first row the outbox produced.

create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_name    text;
  v_wants   boolean;
  v_surface account_type;
  v_base    text;
  v_link    text;
  v_cta     text;
begin
  select u.email, p.first_name, p.email_notifications, p.account_type
    into v_email, v_name, v_wants, v_surface
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = new.recipient_id;

  if v_email is null or not coalesce(v_wants, true) then
    return new;
  end if;

  v_base := coalesce(public.email_setting('app_base_url'), 'http://localhost:5180');

  if new.type = 'message' then
    v_link := v_base || case when v_surface = 'production' then '/studio/messages' else '/talent/messages' end;
    v_cta := 'Read the message';
  elsif new.type = 'application_status' then
    v_link := v_base || '/talent/auditions';
    v_cta := 'See my audition';
  elsif new.type = 'new_application' then
    v_link := v_base || '/studio/casting-calls';
    v_cta := 'Review the candidate';
  else
    v_link := v_base || case when v_surface = 'production' then '/studio/notifications' else '/talent/notifications' end;
    v_cta := 'Open Let It Cast';
  end if;

  insert into public.email_outbox (to_email, to_name, subject, html, kind, notification_id)
  values (
    v_email,
    v_name,
    new.title,
    public.email_html(new.title, coalesce(new.body, ''), v_cta, v_link),
    new.type,
    new.id
  )
  on conflict (notification_id) where notification_id is not null do nothing;

  return new;
end;
$$;
