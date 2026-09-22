-- Email: the only thing that leaves the app.
--
-- Until now nothing ever reached an actor outside Let It Cast. A production
-- could write to someone who had not signed in for a week, and the message sat
-- in the database with an unread badge nobody saw. Measured on the demo project:
-- two messages waiting since the recipient's last sign-in, five days earlier.
--
-- The chain is: a notification row (already written by the triggers) →
-- `email_outbox`, which renders and *keeps* what would be sent → `pg_net`
-- posts it to an HTTP email provider → `reconcile_email_outbox()` reads the
-- response back and records whether it was accepted.
--
-- The outbox is written whether or not a provider is configured, so the record
-- is honest either way: with no key the row is `skipped` with the reason, and
-- the day a key is added the same rows start flying. Nothing pretends to have
-- been sent.
--
-- Secrets live in Supabase Vault, never in a table or in the client:
--   email_provider_url · email_api_key · email_from · app_base_url

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── Preference ───────────────────────────────────────────────────────────────
-- Somebody who does not want email must be able to say so, and it has to be
-- respected at the source rather than by the sender.
alter table public.profiles
  add column if not exists email_notifications boolean not null default true;

comment on column public.profiles.email_notifications is
  'When false, no notification email is enqueued for this account.';

-- ── Outbox ───────────────────────────────────────────────────────────────────

create table if not exists public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  to_email        text not null,
  to_name         text,
  subject         text not null,
  html            text not null,
  kind            text not null,
  notification_id uuid references public.notifications (id) on delete set null,
  invite_id       uuid references public.organization_invites (id) on delete set null,
  -- pending → dispatched → sent | failed, or skipped when there is no provider.
  status          text not null default 'pending',
  detail          text,
  request_id      bigint,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

-- One email per notification, even if a trigger fires twice.
create unique index if not exists email_outbox_notification_key
  on public.email_outbox (notification_id)
  where notification_id is not null;

create index if not exists email_outbox_status_idx on public.email_outbox (status, created_at);

-- No policy at all: the outbox holds addresses and is service-role only.
alter table public.email_outbox enable row level security;

-- ── Settings ─────────────────────────────────────────────────────────────────

create or replace function public.email_setting(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select nullif(trim(decrypted_secret), '')
    from vault.decrypted_secrets
   where name = p_name
   limit 1;
$$;

revoke all on function public.email_setting(text) from public, anon, authenticated;

-- ── Rendering ────────────────────────────────────────────────────────────────

/** The one template: brand, one sentence, one button. */
create or replace function public.email_html(p_title text, p_body text, p_cta text, p_link text)
returns text
language sql
immutable
as $$
  select format(
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F6F5F1;padding:32px">'
    '<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #ECEAE4;border-radius:24px;padding:28px">'
    '<p style="margin:0 0 20px;font-weight:800;font-size:18px;color:#15140F">let it cast</p>'
    '<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#15140F">%s</h1>'
    '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#6E6A60">%s</p>'
    '<a href="%s" style="display:inline-block;background:#15140F;color:#fff;text-decoration:none;'
    'font-weight:700;font-size:14px;padding:12px 20px;border-radius:16px">%s</a>'
    '<p style="margin:24px 0 0;font-size:12px;color:#6E6A60">'
    'You receive this because you have an account on Let It Cast. '
    'You can turn these emails off in your notification settings.</p>'
    '</div></div>',
    coalesce(p_title, ''), coalesce(p_body, ''), p_link, p_cta
  );
$$;

-- ── Enqueue, from a notification ─────────────────────────────────────────────

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

  if new.type = 'new_message' then
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

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.enqueue_notification_email();

-- ── Enqueue, from a team invitation ──────────────────────────────────────────
-- An invitation is the one email whose recipient has no account yet, so it
-- cannot go through `notifications`.

create or replace function public.enqueue_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    text;
  v_who    text;
  v_base   text;
begin
  select o.name into v_org from public.organizations o where o.id = new.org_id;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into v_who
    from public.profiles p
   where p.id = new.invited_by;

  v_base := coalesce(public.email_setting('app_base_url'), 'http://localhost:5180');

  insert into public.email_outbox (to_email, subject, html, kind, invite_id)
  values (
    new.email,
    coalesce(nullif(v_who, ''), 'A casting team') || ' invited you to ' || coalesce(v_org, 'their team'),
    public.email_html(
      'You are invited to ' || coalesce(v_org, 'a casting team'),
      coalesce(nullif(v_who, ''), 'A casting team') ||
        ' invited you to join them on Let It Cast as ' || new.role || '.',
      'Accept the invitation',
      v_base || '/auth/sign-up?invite=' || new.token
    ),
    'team_invite',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists invites_enqueue_email on public.organization_invites;
create trigger invites_enqueue_email
  after insert on public.organization_invites
  for each row execute function public.enqueue_invite_email();

-- ── Dispatch ─────────────────────────────────────────────────────────────────
-- `pg_net` posts outside the transaction, so writing a message is never slowed
-- down (or rolled back) by the email provider.

create or replace function public.dispatch_email()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url     text := public.email_setting('email_provider_url');
  v_key     text := public.email_setting('email_api_key');
  v_from    text := coalesce(public.email_setting('email_from'), 'Let It Cast <notifications@letitcast.app>');
  v_request bigint;
begin
  if v_url is null or v_key is null then
    update public.email_outbox
       set status = 'skipped',
           detail = 'no email provider configured (set email_provider_url and email_api_key in Vault)'
     where id = new.id;
    return new;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'from', v_from,
      'to', jsonb_build_array(new.to_email),
      'subject', new.subject,
      'html', new.html
    ),
    timeout_milliseconds := 8000
  ) into v_request;

  update public.email_outbox
     set status = 'dispatched', request_id = v_request
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists email_outbox_dispatch on public.email_outbox;
create trigger email_outbox_dispatch
  after insert on public.email_outbox
  for each row execute function public.dispatch_email();

-- ── Reconcile ────────────────────────────────────────────────────────────────
-- "Dispatched" only means pg_net took it. The provider's answer comes back
-- asynchronously; this is what turns it into sent or failed, with the reason.

create or replace function public.reconcile_email_outbox()
returns integer
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_done integer := 0;
begin
  with answered as (
    select o.id,
           r.status_code,
           left(coalesce(r.content, r.error_msg, ''), 400) as detail
      from public.email_outbox o
      join net._http_response r on r.id = o.request_id
     where o.status = 'dispatched'
  )
  update public.email_outbox o
     set status  = case when a.status_code between 200 and 299 then 'sent' else 'failed' end,
         detail  = a.detail,
         sent_at = case when a.status_code between 200 and 299 then now() else null end
    from answered a
   where o.id = a.id;

  get diagnostics v_done = row_count;
  return v_done;
end;
$$;

revoke all on function public.reconcile_email_outbox() from public, anon, authenticated;

-- Every minute: the provider's answer is worth at most a minute of waiting.
select cron.unschedule('reconcile-emails')
 where exists (select 1 from cron.job where jobname = 'reconcile-emails');

select cron.schedule('reconcile-emails', '* * * * *', $cron$select public.reconcile_email_outbox()$cron$);
