-- Le graphe social.
--
-- Deux liens, parce qu'il y a deux natures d'acteurs sur la place de marché :
--   · un compte suit un autre compte      (comédien ↔ comédien, comédien → DA)
--   · un compte suit une organisation     (comédien → maison de production)
--
-- Ce que ça change vraiment : le fil peut être filtré sur les productions que
-- l'on suit, et être suivi produit une notification (donc un e-mail, via la
-- sortie déjà en place). Pas de compteur décoratif : tout est compté sur les
-- lignes ci-dessous.
--
-- Les « saved talents » restent le mécanisme de la production (une liste de
-- travail, privée) ; suivre est public et à l'initiative du comédien.

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);

create table if not exists public.organization_follows (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, org_id)
);

create index if not exists organization_follows_org_idx on public.organization_follows (org_id);

alter table public.follows              enable row level security;
alter table public.organization_follows enable row level security;

-- Qui suit qui est public entre comptes connectés : c'est ce qui rend le
-- nombre d'abonnés vérifiable plutôt que déclaratif.
create policy follows_read on public.follows
  for select to authenticated using (true);

create policy follows_write on public.follows
  for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

create policy organization_follows_read on public.organization_follows
  for select to authenticated using (true);

create policy organization_follows_write on public.organization_follows
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ── Notifications ────────────────────────────────────────────────────────────

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(nullif(tp.professional_name, ''),
                  nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                  'Someone')
    into v_name
    from public.profiles p
    left join public.talent_profiles tp on tp.profile_id = p.id
   where p.id = new.follower_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  values (new.following_id, 'new_follower', 'New follower',
          v_name || ' now follows you', 'profile', new.follower_id);

  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_new_follower();

/** Suivre une organisation prévient ses membres actifs. */
create or replace function public.notify_org_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_org  text;
begin
  select coalesce(nullif(tp.professional_name, ''),
                  nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                  'Someone')
    into v_name
    from public.profiles p
    left join public.talent_profiles tp on tp.profile_id = p.id
   where p.id = new.profile_id;

  select name into v_org from public.organizations where id = new.org_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id, 'new_follower', 'New follower',
         v_name || ' now follows ' || coalesce(v_org, 'your organization'),
         'profile', new.profile_id
    from public.organization_members m
   where m.org_id = new.org_id
     and m.status = 'active';

  return new;
end;
$$;

drop trigger if exists organization_follows_notify on public.organization_follows;
create trigger organization_follows_notify
  after insert on public.organization_follows
  for each row execute function public.notify_org_follower();

-- ── Compteurs ────────────────────────────────────────────────────────────────
-- Une vue plutôt que des colonnes dénormalisées : un compteur stocké finit
-- toujours par mentir après une suppression en cascade.

create or replace view public.v_profile_network
with (security_invoker = true)
as
select p.id as profile_id,
       (select count(*) from public.follows f where f.following_id = p.id) as followers,
       (select count(*) from public.follows f where f.follower_id = p.id)  as following,
       (select count(*) from public.organization_follows o where o.profile_id = p.id) as organizations_followed
  from public.profiles p;
