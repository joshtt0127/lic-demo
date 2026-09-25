-- L'administration LIC : le socle.
--
-- Jusqu'ici, une question de support se traitait en requêtant la base de
-- production à la main, avec la clé service role. Aucune trace, aucune limite,
-- aucun moyen de dire qui avait regardé quoi. Les signalements créés en Phase 5
-- s'empilaient sans que personne puisse les traiter.
--
-- Le principe qui gouverne tout ce fichier : **métadonnées par défaut, contenu
-- privé par exception**. Un administrateur voit qu'une self-tape existe, son
-- poids, son état — pas la vidéo. Il voit qu'une conversation existe — pas les
-- messages. Un « God Mode » invisible serait plus simple à écrire et
-- indéfendable à expliquer.
--
-- Deux niveaux, parce que « admin » ne veut rien dire tout seul :
--   · `support` — lit, cherche, comprend, trie les signalements. Aucune action
--     destructive ;
--   · `admin`   — vérifie, suspend, tranche. Chaque geste laisse une trace
--     nominative avec son motif.
--
-- Et une règle sans exception : **toute action administrative écrit sa raison**.
-- Un motif obligatoire n'empêche pas les abus, mais il les rend racontables.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type public.platform_role as enum ('none', 'support', 'admin');
  end if;
end $$;

alter table public.profiles
  add column if not exists platform_role public.platform_role not null default 'none',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

comment on column public.profiles.platform_role is
  'none (défaut) · support (lecture + tri) · admin (actions). Ne se change jamais depuis l''app.';

-- ── Qui est qui ────────────────────────────────────────────────────────────

create or replace function public.is_lic_support()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.platform_role in ('support', 'admin')
  );
$$;

create or replace function public.is_lic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.platform_role = 'admin'
  );
$$;

revoke execute on function public.is_lic_support() from anon, public;
revoke execute on function public.is_lic_admin() from anon, public;
grant execute on function public.is_lic_support() to authenticated;
grant execute on function public.is_lic_admin() to authenticated;

/**
 * Le rôle de plateforme ne se donne pas depuis l'app.
 *
 * Il se pose en base, par quelqu'un qui a les clés du projet. Une escalade de
 * privilège administrative doit demander un accès à l'infrastructure, pas une
 * requête bien tournée — c'est la même leçon que `account_type` en Phase 1.
 */
create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile cannot change identity' using errcode = '42501';
  end if;

  if old.account_type is not null and new.account_type is distinct from old.account_type then
    raise exception 'Your account type is chosen during onboarding and cannot be changed'
      using errcode = '42501';
  end if;

  if new.platform_role is distinct from old.platform_role then
    raise exception 'Platform roles are granted outside the app' using errcode = '42501';
  end if;

  -- Se dé-suspendre soi-même viderait la suspension de son sens.
  if new.suspended_at is distinct from old.suspended_at and not public.is_lic_admin() then
    raise exception 'Only Let It Cast can lift a suspension' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_profile_identity() from anon, authenticated, public;

-- ── La trace ───────────────────────────────────────────────────────────────

create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  subject_type text not null,
  subject_id   uuid,
  /** Obligatoire : une action sans motif n'est pas racontable. */
  reason       text not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint admin_actions_reason_not_empty check (length(btrim(reason)) > 0)
);

comment on table public.admin_actions is
  'Journal des actions administratives. Append-only, motif obligatoire.';

create index if not exists admin_actions_recent_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;

drop policy if exists admin_actions_read on public.admin_actions;
create policy admin_actions_read on public.admin_actions
  for select to authenticated
  using (public.is_lic_support());

-- Aucune policy d'écriture : le journal s'écrit depuis les fonctions d'action.

/** Écrit la trace. Appelée par les actions, jamais par un client. */
create or replace function public.record_admin_action(
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_actions (actor_id, action, subject_type, subject_id, reason, metadata)
  values (auth.uid(), p_action, p_subject_type, p_subject_id, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke execute on function public.record_admin_action(text, text, uuid, text, jsonb)
  from anon, authenticated, public;

-- ── Ce que le support peut lire ────────────────────────────────────────────
--
-- Volontairement : des métadonnées. Les candidatures et les self-tapes sont
-- listables (leur existence, leur état, leurs dates) ; le contenu privé ne
-- l'est pas — notes internes, votes, messages et vidéos gardent leurs policies
-- d'origine, sans exception pour l'administration.

drop policy if exists applications_read on public.applications;
create policy applications_read on public.applications
  for select to authenticated
  using (
    talent_id = auth.uid()
    or (status <> 'draft' and public.is_org_member(public.role_org_id(role_id)))
    or public.is_lic_support()
  );

drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations
  for select to authenticated using (true);

drop policy if exists reports_read_own on public.reports;
create policy reports_read on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_lic_support());

drop policy if exists self_tapes_read on public.self_tapes;
create policy self_tapes_read on public.self_tapes
  for select to authenticated
  using (
    public.is_org_member(public.application_org_id(application_id))
    or exists (
      select 1 from public.applications a
       where a.id = self_tapes.application_id and a.talent_id = auth.uid()
    )
    -- Le support voit qu'une tape existe ; la policy du stockage, elle, ne lui
    -- ouvre rien — la vidéo reste hors de portée.
    or public.is_lic_support()
  );

-- ── Les actions ────────────────────────────────────────────────────────────

/** Vérifier, suspendre ou rétablir une organisation. */
create or replace function public.admin_set_organization_status(
  p_org uuid,
  p_status public.org_verification,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lic_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'An administrative action needs a reason' using errcode = '22023';
  end if;

  update public.organizations
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else verified_at end,
         suspended_reason = case when p_status = 'suspended' then p_reason else null end
   where id = p_org;

  perform public.record_admin_action(
    'organization.' || p_status::text, 'organization', p_org, p_reason
  );
end;
$$;

/** Suspendre ou rétablir une personne. */
create or replace function public.admin_set_user_suspended(
  p_profile uuid,
  p_suspended boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lic_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'An administrative action needs a reason' using errcode = '22023';
  end if;

  update public.profiles
     set suspended_at = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then p_reason else null end
   where id = p_profile;

  perform public.record_admin_action(
    case when p_suspended then 'user.suspend' else 'user.restore' end,
    'profile', p_profile, p_reason
  );
end;
$$;

/** Trier un signalement : le prendre en main, le clore, ou l'écarter. */
create or replace function public.admin_set_report_status(
  p_report uuid,
  p_status public.report_status,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prendre en main relève du support ; conclure relève de l'admin.
  if p_status = 'in_review' then
    if not public.is_lic_support() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif not public.is_lic_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_status in ('resolved', 'dismissed') and coalesce(btrim(p_resolution), '') = '' then
    raise exception 'Closing a report needs a resolution' using errcode = '22023';
  end if;

  update public.reports
     set status = p_status,
         resolution = nullif(btrim(coalesce(p_resolution, '')), ''),
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_report;

  perform public.record_admin_action(
    'report.' || p_status::text, 'report', p_report,
    coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), 'taken in hand')
  );
end;
$$;

revoke execute on function public.admin_set_organization_status(uuid, public.org_verification, text)
  from anon, public;
revoke execute on function public.admin_set_user_suspended(uuid, boolean, text) from anon, public;
revoke execute on function public.admin_set_report_status(uuid, public.report_status, text)
  from anon, public;
grant execute on function public.admin_set_organization_status(uuid, public.org_verification, text)
  to authenticated;
grant execute on function public.admin_set_user_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_report_status(uuid, public.report_status, text)
  to authenticated;

-- ── Ce qu'une suspension empêche ───────────────────────────────────────────

create or replace function public.guard_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.suspended_at is not null
  ) then
    raise exception 'This account is suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_suspended() from anon, authenticated, public;

drop trigger if exists posts_guard_suspended on public.posts;
create trigger posts_guard_suspended
  before insert on public.posts
  for each row execute function public.guard_suspended();

drop trigger if exists applications_guard_suspended on public.applications;
create trigger applications_guard_suspended
  before insert on public.applications
  for each row execute function public.guard_suspended();

drop trigger if exists messages_guard_suspended on public.messages;
create trigger messages_guard_suspended
  before insert on public.messages
  for each row execute function public.guard_suspended();

drop trigger if exists casting_calls_guard_suspended on public.casting_calls;
create trigger casting_calls_guard_suspended
  before insert on public.casting_calls
  for each row execute function public.guard_suspended();
