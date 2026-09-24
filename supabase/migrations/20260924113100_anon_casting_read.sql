-- La lecture anonyme, strictement bornée.
--
-- (Migration séparée de l'ajout des valeurs d'énumération : PostgreSQL refuse
-- d'utiliser une valeur d'enum dans la même transaction que sa création.)
--
-- Quatre tables s'ouvrent au visiteur non connecté, et uniquement par le chemin
-- d'une annonce publiée :
--   · `casting_calls` — l'annonce elle-même ;
--   · `roles`         — ce qu'elle cherche ;
--   · `projects`      — le projet qui la porte ;
--   · `organizations` — qui publie.
--
-- Tout le reste garde ses policies : un visiteur ne lit ni candidature, ni
-- self-tape, ni note, ni vote, ni profil de comédien. Un test le vérifie table
-- par table avec la clé publique et aucune session.

/** Une annonce ouverte à la lecture : publiée, et pas réservée aux invités. */
create or replace function public.casting_is_openly_readable(p_casting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casting_calls c
     where c.id = p_casting
       and c.status = 'published'
       and c.visibility in ('public', 'private_link')
  );
$$;

revoke execute on function public.casting_is_openly_readable(uuid) from public;
grant execute on function public.casting_is_openly_readable(uuid) to anon, authenticated;

-- ── Le casting ─────────────────────────────────────────────────────────────

drop policy if exists casting_calls_read_anon on public.casting_calls;
create policy casting_calls_read_anon on public.casting_calls
  for select to anon
  using (status = 'published' and visibility in ('public', 'private_link'));

-- Les comptes connectés gagnent `private_link` au même titre.
drop policy if exists casting_calls_read on public.casting_calls;
create policy casting_calls_read on public.casting_calls
  for select to authenticated
  using (
    (status = 'published' and visibility in ('public', 'private_link'))
    or public.is_org_member(public.project_org_id(project_id))
    or public.talent_applied_to_casting(id)
  );

-- ── Les rôles ──────────────────────────────────────────────────────────────

drop policy if exists roles_read_anon on public.roles;
create policy roles_read_anon on public.roles
  for select to anon
  using (public.casting_is_openly_readable(casting_call_id));

-- ── Le projet porteur ──────────────────────────────────────────────────────

drop policy if exists projects_read_anon on public.projects;
create policy projects_read_anon on public.projects
  for select to anon
  using (
    exists (
      select 1 from public.casting_calls c
       where c.project_id = projects.id
         and c.status = 'published'
         and c.visibility in ('public', 'private_link')
    )
  );

-- ── Et qui publie ──────────────────────────────────────────────────────────

drop policy if exists organizations_read_anon on public.organizations;
create policy organizations_read_anon on public.organizations
  for select to anon
  using (
    exists (
      select 1
        from public.projects p
        join public.casting_calls c on c.project_id = p.id
       where p.org_id = organizations.id
         and c.status = 'published'
         and c.visibility in ('public', 'private_link')
    )
  );
