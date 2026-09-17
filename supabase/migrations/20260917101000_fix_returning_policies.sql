-- Fix: `insert ... returning` was refused on `casting_calls` and `roles`.
--
-- Postgres applies the SELECT policy to the row returned by an INSERT. Those
-- policies resolved the owning organization by re-reading their *own* table by
-- id (`casting_call_org_id(id)`, `role_org_id(id)`). A STABLE function called
-- inside the same command runs on a snapshot that does not include the row that
-- command is inserting, so the lookup returned NULL, `is_org_member(NULL)` was
-- false, and the insert failed with
-- "new row violates row-level security policy".
--
-- The row already carries its parent key, so resolve from that instead: no
-- self-read, no snapshot problem. Found by `scripts/verify-backend.mjs`.

/** Is this casting call open to every authenticated user? */
create or replace function public.casting_call_is_public(p_casting_call uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casting_calls c
     where c.id = p_casting_call
       and c.status = 'published'
       and c.visibility = 'public'
  );
$$;

-- ── casting_calls: resolve through project_id ────────────────────────────────

drop policy if exists casting_calls_read on public.casting_calls;
create policy casting_calls_read on public.casting_calls
  for select to authenticated using (
    (status = 'published' and visibility = 'public')
    or public.is_org_member(public.project_org_id(project_id))
  );

drop policy if exists casting_calls_update on public.casting_calls;
create policy casting_calls_update on public.casting_calls
  for update to authenticated
  using (public.can_manage_org(public.project_org_id(project_id)))
  with check (public.can_manage_org(public.project_org_id(project_id)));

drop policy if exists casting_calls_delete on public.casting_calls;
create policy casting_calls_delete on public.casting_calls
  for delete to authenticated
  using (public.can_manage_org(public.project_org_id(project_id)));

-- ── roles: resolve through casting_call_id ──────────────────────────────────

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles
  for select to authenticated using (
    public.casting_call_is_public(casting_call_id)
    or public.is_org_member(public.casting_call_org_id(casting_call_id))
  );

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles
  for update to authenticated
  using (public.can_manage_org(public.casting_call_org_id(casting_call_id)))
  with check (public.can_manage_org(public.casting_call_org_id(casting_call_id)));

drop policy if exists roles_delete on public.roles;
create policy roles_delete on public.roles
  for delete to authenticated
  using (public.can_manage_org(public.casting_call_org_id(casting_call_id)));

-- ── organizations / projects: same treatment for their own RETURNING ────────
-- `organizations_update` reads membership by org id, which is the row's own
-- primary key — fine on UPDATE (the row exists), but an INSERT ... RETURNING on
-- `organizations` needs a SELECT policy that does not depend on membership that
-- is only created on the next request. It is already `using (true)`, so nothing
-- to change; `projects_read` resolves from org_id, also a plain column.
