-- A talent must keep reading the role, casting call and project they applied to.
--
-- `casting_calls_read` / `roles_read` / `projects_read` only exposed *published*
-- castings, so the moment a production closed submissions the talent's own
-- audition lost its role name, its casting and its project title — measured, not
-- supposed: the embed came back `roles: null`.
--
-- Closing submissions is a decision about *new* applications. It must not blank
-- an audition that was already sent.
--
-- These helpers read `applications` (and `roles`), never the table whose policy
-- calls them: a SELECT policy that re-reads its own table by id breaks
-- `insert ... returning` (see 20260917101000).

create or replace function public.talent_applied_to_role(p_role uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.applications a
     where a.role_id = p_role
       and a.talent_id = auth.uid()
  );
$$;

create or replace function public.talent_applied_to_casting(p_casting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.applications a
      join public.roles r on r.id = a.role_id
     where r.casting_call_id = p_casting
       and a.talent_id = auth.uid()
  );
$$;

create or replace function public.talent_applied_to_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.applications a
      join public.roles r         on r.id = a.role_id
      join public.casting_calls c on c.id = r.casting_call_id
     where c.project_id = p_project
       and a.talent_id = auth.uid()
  );
$$;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles
  for select to authenticated using (
    public.casting_call_is_public(casting_call_id)
    or public.is_org_member(public.casting_call_org_id(casting_call_id))
    or public.talent_applied_to_role(id)
  );

drop policy if exists casting_calls_read on public.casting_calls;
create policy casting_calls_read on public.casting_calls
  for select to authenticated using (
    (status = 'published' and visibility = 'public')
    or public.is_org_member(public.project_org_id(project_id))
    or public.talent_applied_to_casting(id)
  );

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to authenticated using (
    public.is_org_member(org_id)
    or exists (
      select 1 from public.casting_calls c
       where c.project_id = projects.id
         and c.status = 'published'
         and c.visibility = 'public'
    )
    or public.talent_applied_to_project(id)
  );
