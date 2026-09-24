-- P0-1 — On ne rejoint plus une organisation en le décidant soi-même.
--
-- L'audit a prouvé le pire cas : depuis un compte comédien ordinaire, une seule
-- requête suffisait à devenir `owner` d'une organisation tierce, puis à lire ses
-- candidatures, lister ses self-tapes, télécharger la vidéo d'un autre comédien
-- et refuser sa candidature. Toute la sécurité multi-tenant repose sur cette
-- table : son écriture était ouverte.
--
-- La policy gardait une branche `profile_id = auth.uid()` parce que deux
-- parcours légitimes en avaient besoin :
--   · la **création** d'une organisation (on s'ajoute comme owner) ;
--   · l'**acceptation d'une invitation**.
-- On ne supprime donc pas la branche : on la qualifie. S'ajouter soi-même reste
-- possible, mais seulement pour revendiquer une organisation qu'on vient de
-- créer et qui n'a encore aucun membre, ou pour honorer une invitation qui
-- existe vraiment, adressée à son adresse e-mail, ni expirée ni déjà utilisée.
--
-- P0-4 — Et le rôle lui-même devient gardé : un `admin` ne peut plus se
-- promouvoir `owner`, ni toucher à la ligne d'un owner, ni changer son propre
-- rôle. Un owner ne peut pas partir sans avoir transmis la propriété.

-- ── Aides de policy ────────────────────────────────────────────────────────
-- `security definer` : elles lisent des tables que l'appelant ne voit pas
-- forcément. `search_path` épinglé, exécution refusée à `anon`.

/** Aucune ligne de membre : l'organisation vient d'être créée et n'a pas de propriétaire. */
create or replace function public.org_is_unclaimed(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.organization_members m where m.org_id = p_org);
$$;

/** L'appelant est bien celui qui a créé cette organisation. */
create or replace function public.org_created_by_me(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o where o.id = p_org and o.created_by = auth.uid()
  );
$$;

/**
 * Le rôle d'une invitation valide adressée à l'appelant, sinon `null`.
 *
 * C'est l'invitation qui décide du rôle, jamais la requête : accepter une
 * invitation de `member` ne peut pas créer un `owner`.
 */
create or replace function public.pending_invite_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select i.role
    from public.organization_invites i
   where i.org_id = p_org
     and lower(i.email) = lower(coalesce(auth.email(), '~none~'))
     and i.accepted_at is null
     and (i.expires_at is null or i.expires_at > now())
   order by i.created_at desc
   limit 1;
$$;

revoke execute on function public.org_is_unclaimed(uuid) from anon, public;
revoke execute on function public.org_created_by_me(uuid) from anon, public;
revoke execute on function public.pending_invite_role(uuid) from anon, public;
grant execute on function public.org_is_unclaimed(uuid) to authenticated;
grant execute on function public.org_created_by_me(uuid) to authenticated;
grant execute on function public.pending_invite_role(uuid) to authenticated;

-- ── La porte d'entrée ──────────────────────────────────────────────────────

drop policy if exists organization_members_insert on public.organization_members;
create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (
    -- Un administrateur ajoute quelqu'un à son organisation.
    public.is_org_admin(org_id)
    -- Ou : je revendique l'organisation que je viens de créer.
    or (
      profile_id = auth.uid()
      and role = 'owner'
      and status = 'active'
      and public.org_created_by_me(org_id)
      and public.org_is_unclaimed(org_id)
    )
    -- Ou : j'honore une invitation qui m'est réellement adressée, au rôle prévu.
    or (
      profile_id = auth.uid()
      and status = 'active'
      and role = public.pending_invite_role(org_id)
    )
  );

-- ── Le rôle ────────────────────────────────────────────────────────────────

create or replace function public.guard_org_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_role public.org_role;
  owners_left integer;
begin
  -- Pas d'appelant : clé service role, migration, trigger interne.
  if actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.status = 'active' then
      select count(*) into owners_left
        from public.organization_members m
       where m.org_id = old.org_id and m.role = 'owner' and m.status = 'active';
      if owners_left <= 1 then
        raise exception 'Transfer ownership before leaving this organization'
          using errcode = '42501';
      end if;
    end if;
    return old;
  end if;

  actor_role := public.org_role_of(new.org_id);

  if tg_op = 'INSERT' then
    -- Un owner ne se crée que par transmission, ou par la revendication de
    -- l'organisation qu'on vient de créer.
    if new.role = 'owner'
       and actor_role is distinct from 'owner'
       and not (new.profile_id = actor and public.org_created_by_me(new.org_id)) then
      raise exception 'Only an owner can grant ownership' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.org_id is distinct from old.org_id or new.profile_id is distinct from old.profile_id then
    raise exception 'A membership cannot be moved to another organization or person'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if old.role = 'owner' and actor_role is distinct from 'owner' then
      raise exception 'Only an owner can change an owner' using errcode = '42501';
    end if;
    if new.role = 'owner' and actor_role is distinct from 'owner' then
      raise exception 'Only an owner can grant ownership' using errcode = '42501';
    end if;
    if new.profile_id = actor and actor_role is distinct from 'owner' then
      raise exception 'You cannot change your own role' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_org_member_role() from anon, authenticated, public;

drop trigger if exists organization_members_guard_role on public.organization_members;
create trigger organization_members_guard_role
  before insert or update or delete on public.organization_members
  for each row execute function public.guard_org_member_role();
