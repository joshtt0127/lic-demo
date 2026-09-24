-- Le callback : un vrai moment, pas un statut.
--
-- Jusqu'ici, « callback » n'était qu'une valeur dans une énumération. La
-- production cochait une case, le comédien recevait « Callback » — et après ?
-- Ni date, ni lieu, ni lien de visio, ni consigne, aucun moyen de dire « je ne
-- peux pas mardi ». Toute la coordination repartait sur WhatsApp, c'est-à-dire
-- hors de la plateforme, c'est-à-dire nulle part quand il faut retrouver qui
-- avait dit quoi.
--
-- Trois formes, parce que le métier en a trois :
--   · `in_person`  — on se voit, il faut une adresse ;
--   · `video_call` — on se parle, il faut un lien ;
--   · `self_tape`  — on redemande une tape, il faut une consigne.
--
-- Et trois réponses possibles, parce qu'un comédien a une vie : accepter,
-- décliner, ou demander un autre créneau. Le silence n'en est pas une — d'où la
-- date limite de réponse, facultative mais prévue.
--
-- Le fuseau est stocké à côté de l'instant : « mardi 14 h » n'a aucun sens si
-- la production est à Paris et le comédien à Montréal, et un `timestamptz` seul
-- ne dit pas dans quel fuseau la proposition a été faite.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'callback_kind') then
    create type public.callback_kind as enum ('in_person', 'video_call', 'self_tape');
  end if;
  if not exists (select 1 from pg_type where typname = 'callback_response') then
    create type public.callback_response as enum
      ('pending', 'accepted', 'declined', 'change_requested');
  end if;
end $$;

create table if not exists public.callbacks (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.applications (id) on delete cascade,
  kind              public.callback_kind not null,
  title             text,
  /** Quand — nul pour une self-tape, qui n'a pas d'heure de rendez-vous. */
  scheduled_at      timestamptz,
  /** Le fuseau dans lequel la proposition a été faite (nom IANA). */
  timezone          text,
  /** Où, pour un rendez-vous physique. */
  location          text,
  /** Le lien, pour une visio. */
  meeting_url       text,
  instructions      text,
  message           text,
  /** Jusqu'à quand on attend une réponse. */
  respond_by        timestamptz,
  response          public.callback_response not null default 'pending',
  response_note     text,
  responded_at      timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Un rendez-vous physique a une adresse, une visio a un lien. Une tape n'a
  -- ni l'un ni l'autre, mais elle a une consigne.
  constraint callbacks_has_what_it_needs check (
    (kind = 'in_person'  and coalesce(trim(location), '') <> '')
    or (kind = 'video_call' and coalesce(trim(meeting_url), '') <> '')
    or (kind = 'self_tape'  and coalesce(trim(instructions), '') <> '')
  )
);

comment on table public.callbacks is
  'Le rendez-vous proposé après une présélection, et la réponse du comédien.';

create index if not exists callbacks_application_idx on public.callbacks (application_id);

alter table public.callbacks enable row level security;

drop trigger if exists callbacks_touch on public.callbacks;
create trigger callbacks_touch
  before update on public.callbacks
  for each row execute function public.set_updated_at();

-- ── Qui voit, qui écrit ────────────────────────────────────────────────────

/** L'organisation qui porte la candidature de ce callback. */
create or replace function public.callback_org_id(p_callback uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.application_org_id(c.application_id)
    from public.callbacks c
   where c.id = p_callback;
$$;

revoke execute on function public.callback_org_id(uuid) from anon, public;
grant execute on function public.callback_org_id(uuid) to authenticated;

drop policy if exists callbacks_read on public.callbacks;
create policy callbacks_read on public.callbacks
  for select to authenticated
  using (
    public.is_org_member(public.application_org_id(application_id))
    or exists (
      select 1 from public.applications a
       where a.id = callbacks.application_id and a.talent_id = auth.uid()
    )
  );

drop policy if exists callbacks_write on public.callbacks;
create policy callbacks_write on public.callbacks
  for insert to authenticated
  with check (public.can_manage_org(public.application_org_id(application_id)));

-- La mise à jour est ouverte aux deux côtés ; un trigger décide qui touche quoi.
drop policy if exists callbacks_update on public.callbacks;
create policy callbacks_update on public.callbacks
  for update to authenticated
  using (
    public.can_manage_org(public.application_org_id(application_id))
    or exists (
      select 1 from public.applications a
       where a.id = callbacks.application_id and a.talent_id = auth.uid()
    )
  );

drop policy if exists callbacks_delete on public.callbacks;
create policy callbacks_delete on public.callbacks
  for delete to authenticated
  using (public.can_manage_org(public.application_org_id(application_id)));

/**
 * Le comédien répond ; il ne se déplace pas la date.
 *
 * Sans ce garde, la policy de mise à jour lui donnerait le droit de réécrire le
 * lieu ou l'heure de son propre rendez-vous — ce qui ne veut rien dire.
 */
create or replace function public.guard_callback_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_talent boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  select a.talent_id = auth.uid() into v_is_talent
    from public.applications a
   where a.id = new.application_id;

  if coalesce(v_is_talent, false)
     and not public.is_org_member(public.application_org_id(new.application_id)) then
    if new.kind is distinct from old.kind
       or new.scheduled_at is distinct from old.scheduled_at
       or new.timezone is distinct from old.timezone
       or new.location is distinct from old.location
       or new.meeting_url is distinct from old.meeting_url
       or new.instructions is distinct from old.instructions
       or new.respond_by is distinct from old.respond_by then
      raise exception 'You can answer a callback, not reschedule it' using errcode = '42501';
    end if;
    if new.response is distinct from old.response then
      new.responded_at := now();
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_callback_update() from anon, authenticated, public;

drop trigger if exists callbacks_guard_update on public.callbacks;
create trigger callbacks_guard_update
  before update on public.callbacks
  for each row execute function public.guard_callback_update();

-- ── Ce que ça déclenche ────────────────────────────────────────────────────

create or replace function public.on_callback_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent uuid;
  v_role   text;
  v_org    uuid;
begin
  select a.talent_id, r.name, public.application_org_id(a.id)
    into v_talent, v_role, v_org
    from public.applications a
    join public.roles r on r.id = a.role_id
   where a.id = new.application_id;

  -- La candidature passe au callback si la machine à états l'autorise depuis
  -- son état courant ; sinon on laisse le statut tranquille — c'est la
  -- production qui décide du parcours, pas un effet de bord.
  update public.applications
     set status = 'callback'
   where id = new.application_id
     and status in ('shortlisted');

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  values (
    v_talent,
    'callback',
    'You have a callback',
    coalesce(nullif(new.title, ''), coalesce(v_role, 'A role')),
    'application',
    new.application_id
  );

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, after)
  values ('CALLBACK_REQUESTED', auth.uid(), 'callback', new.id, v_org, v_talent,
          jsonb_build_object('kind', new.kind, 'scheduled_at', new.scheduled_at));

  return new;
end;
$$;

revoke execute on function public.on_callback_created() from anon, authenticated, public;

drop trigger if exists callbacks_on_created on public.callbacks;
create trigger callbacks_on_created
  after insert on public.callbacks
  for each row execute function public.on_callback_created();

create or replace function public.on_callback_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent uuid;
  v_who    text;
  v_org    uuid;
begin
  if new.response is not distinct from old.response then
    return new;
  end if;

  select a.talent_id, public.application_org_id(a.id)
    into v_talent, v_org
    from public.applications a
   where a.id = new.application_id;

  select trim(coalesce(t.professional_name,
              coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
    into v_who
    from public.profiles p
    left join public.talent_profiles t on t.profile_id = p.id
   where p.id = v_talent;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id,
         'callback',
         coalesce(nullif(v_who, ''), 'A talent') || ' ' ||
           case new.response
             when 'accepted' then 'accepted the callback'
             when 'declined' then 'declined the callback'
             else 'asked for another time'
           end,
         coalesce(nullif(new.response_note, ''), coalesce(nullif(new.title, ''), 'Callback')),
         'application',
         new.application_id
    from public.organization_members m
   where m.org_id = v_org and m.status = 'active';

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, before, after)
  values (
    case new.response
      when 'accepted' then 'CALLBACK_ACCEPTED'
      when 'declined' then 'CALLBACK_DECLINED'
      else 'CALLBACK_CHANGE_REQUESTED'
    end,
    auth.uid(), 'callback', new.id, v_org, v_talent,
    jsonb_build_object('response', old.response),
    jsonb_build_object('response', new.response)
  );

  return new;
end;
$$;

revoke execute on function public.on_callback_answered() from anon, authenticated, public;

drop trigger if exists callbacks_on_answered on public.callbacks;
create trigger callbacks_on_answered
  after update of response on public.callbacks
  for each row execute function public.on_callback_answered();
