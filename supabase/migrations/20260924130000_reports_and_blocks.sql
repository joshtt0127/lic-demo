-- Signaler, et bloquer.
--
-- Le fil, les publications et la messagerie existent depuis des semaines ; le
-- recours, non. Quelqu'un de harcelé sur la plateforme n'avait rien — pas un
-- bouton, pas une file, personne à qui le dire. Sur un produit où des comédiens,
-- souvent en position de faiblesse, échangent avec des productions, c'est le
-- manque le plus grave après les failles d'isolation.
--
-- **Signaler** produit un dossier, pas une suppression. Ce qui est signalé reste
-- en place tant qu'une décision humaine n'a pas été prise : un signalement n'est
-- pas un verdict, et laisser n'importe qui faire disparaître le contenu d'un
-- autre serait un outil d'abus de plus.
--
-- **Bloquer** coupe les interactions directes à venir — écrire, suivre — sans
-- rien détruire de l'historique métier. Une candidature reste une candidature,
-- une décision reste une décision, les faits restent écrits. On ne réécrit pas
-- le passé professionnel de deux personnes parce que l'une en a bloqué l'autre.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_reason') then
    create type public.report_reason as enum
      ('spam', 'impersonation', 'harassment', 'inappropriate', 'fraudulent_casting', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
  end if;
end $$;

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  /** Ce sur quoi porte le signalement : profil, publication, casting, message. */
  subject_type text not null check (subject_type in ('profile', 'post', 'casting_call', 'message')),
  subject_id   uuid not null,
  reason       public.report_reason not null,
  details      text,
  status       public.report_status not null default 'open',
  resolution   text,
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now(),
  -- On ne signale pas deux fois la même chose : ça ne pèse pas plus lourd et
  -- ça encombre la file de quelqu'un.
  unique (reporter_id, subject_type, subject_id)
);

comment on table public.reports is
  'Les signalements. Un dossier à traiter, jamais une suppression automatique.';

create index if not exists reports_open_idx on public.reports (status, created_at desc);
create index if not exists reports_subject_idx on public.reports (subject_type, subject_id);

alter table public.reports enable row level security;

-- On signale pour soi ; on relit ce qu'on a signalé. Le traitement viendra avec
-- l'administration LIC (Phase 7) — d'ici là, la file se lit en service role.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- ── Bloquer ────────────────────────────────────────────────────────────────

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Coupe les interactions directes à venir. Ne touche à aucun historique métier.';

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- La personne bloquée ne doit pas pouvoir lire la liste de qui l'a bloquée :
-- la policy ci-dessus ne rend que ses propres blocages, dans les deux sens.

/** L'un des deux a-t-il bloqué l'autre ? Le blocage vaut dans les deux sens. */
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function public.blocked_between(uuid, uuid) from anon, public;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- ── Ce que le blocage coupe ────────────────────────────────────────────────

/**
 * Écrire à quelqu'un qui vous a bloqué — ou que vous avez bloqué — n'est plus
 * possible. Le reste de la règle de messagerie ne bouge pas.
 */
create or replace function public.can_message(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_other is not null
    and p_other <> auth.uid()
    and not public.blocked_between(auth.uid(), p_other)
    and (
      (
        exists (
          select 1 from public.organization_members m
           where m.profile_id = auth.uid() and m.status = 'active'
        )
        and exists (
          select 1 from public.profiles p
           where p.id = p_other and p.account_type = 'talent'
        )
      )
      or exists (
        select 1
          from public.applications a
          join public.roles r on r.id = a.role_id
          join public.casting_calls cc on cc.id = r.casting_call_id
          join public.projects pr on pr.id = cc.project_id
          join public.organization_members m
            on m.org_id = pr.org_id and m.status = 'active'
         where a.talent_id = auth.uid() and m.profile_id = p_other
      )
      or exists (
        select 1
          from public.applications a
          join public.roles r on r.id = a.role_id
          join public.casting_calls cc on cc.id = r.casting_call_id
          join public.projects pr on pr.id = cc.project_id
          join public.organization_members m
            on m.org_id = pr.org_id and m.status = 'active'
         where a.talent_id = p_other and m.profile_id = auth.uid()
      )
    );
$$;

/** On ne suit pas quelqu'un avec qui on est bloqué. */
create or replace function public.guard_follow_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.blocked_between(new.follower_id, new.following_id) then
    raise exception 'You cannot follow this person' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_follow_block() from anon, authenticated, public;

drop trigger if exists follows_guard_block on public.follows;
create trigger follows_guard_block
  before insert on public.follows
  for each row execute function public.guard_follow_block();

/**
 * Bloquer défait le lien social existant, dans les deux sens.
 *
 * C'est le seul effet destructif assumé, et il est limité au social : un
 * abonnement n'est pas un fait métier, et laisser quelqu'un qu'on vient de
 * bloquer dans ses abonnés serait absurde. Les candidatures, décisions et faits
 * ne bougent pas.
 */
create or replace function public.on_block_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

revoke execute on function public.on_block_created() from anon, authenticated, public;

drop trigger if exists blocks_on_created on public.blocks;
create trigger blocks_on_created
  after insert on public.blocks
  for each row execute function public.on_block_created();

-- ── Et ce qu'on ne voit plus ───────────────────────────────────────────────
--
-- Les publications de quelqu'un avec qui on est bloqué disparaissent du fil.
-- La policy le fait côté base : un filtre côté client laisserait la donnée
-- partir sur le réseau, ce qui n'est pas la même chose.

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to authenticated
  using (not public.blocked_between(auth.uid(), author_id));
