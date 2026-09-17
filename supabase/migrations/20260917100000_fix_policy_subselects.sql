-- Fix: two policies resolved the owning organization with a bare sub-select on
-- `projects` instead of a security-definer helper.
--
-- Inside a policy expression the sub-select is itself subject to the RLS of
-- `projects`, whose read policy in turn reads `casting_calls` — the table being
-- written. That circular evaluation made `casting_calls_insert` fail for a
-- legitimate owner ("new row violates row-level security policy"), as caught by
-- `scripts/verify-backend.mjs`.
--
-- Every other policy in this schema already goes through a definer helper; this
-- makes those two consistent.

create or replace function public.project_org_id(p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id from public.projects p where p.id = p_project;
$$;

drop policy if exists casting_calls_insert on public.casting_calls;
create policy casting_calls_insert on public.casting_calls
  for insert to authenticated
  with check (public.can_manage_org(public.project_org_id(project_id)));

drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members
  for select to authenticated using (
    profile_id = auth.uid() or public.is_org_member(public.project_org_id(project_id))
  );

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members
  for all to authenticated
  using (public.can_manage_org(public.project_org_id(project_id)))
  with check (public.can_manage_org(public.project_org_id(project_id)));

-- Same class of problem, one step further out: a talent reading a published
-- casting call needs the project row for context, and `projects_read` reached
-- back into `casting_calls`. Resolve it with a definer helper as well.
create or replace function public.project_has_public_casting(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casting_calls c
     where c.project_id = p_project
       and c.status = 'published'
       and c.visibility = 'public'
  );
$$;

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to authenticated using (
    public.is_org_member(org_id) or public.project_has_public_casting(id)
  );
