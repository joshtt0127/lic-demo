-- Audition Review Queue™ — attribution.
--
-- « Ces 50 auditions sont pour Sarah » : une candidature peut être confiée à
-- un membre de l'équipe. Une seule personne à la fois — l'attribution dit qui
-- s'en occupe, pas qui a le droit de la voir (toute l'équipe la voit toujours).
--
--   · qui dirige le casting (owner, admin, casting_director) attribue à
--     n'importe quel membre qui peut reviewer ;
--   · un membre peut se l'attribuer à lui-même, ou rendre la sienne ;
--   · on n'attribue jamais à quelqu'un hors de l'équipe, ni à un viewer.

create table public.application_assignments (
  application_id  uuid primary key references public.applications (id) on delete cascade,
  assignee_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  assigned_at     timestamptz not null default now()
);

create index application_assignments_assignee on public.application_assignments (assignee_id);

/** Le profil peut-il reviewer dans cette organisation (membre actif, pas viewer) ? */
create or replace function public.is_reviewer_of(p_org uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
     where m.org_id = p_org
       and m.profile_id = p_profile
       and m.status = 'active'
       and m.role in ('owner', 'admin', 'casting_director', 'member')
  );
$$;

alter table public.application_assignments enable row level security;

create policy application_assignments_read on public.application_assignments
  for select to authenticated
  using (public.is_org_member(public.application_org_id(application_id)));

create policy application_assignments_insert on public.application_assignments
  for insert to authenticated
  with check (
    assigned_by = auth.uid()
    and public.is_reviewer_of(public.application_org_id(application_id), assignee_id)
    and (
      public.org_role_of(public.application_org_id(application_id)) in ('owner', 'admin', 'casting_director')
      or (assignee_id = auth.uid() and public.can_review_org(public.application_org_id(application_id)))
    )
  );

create policy application_assignments_update on public.application_assignments
  for update to authenticated
  using (public.can_review_org(public.application_org_id(application_id)))
  with check (
    assigned_by = auth.uid()
    and public.is_reviewer_of(public.application_org_id(application_id), assignee_id)
    and (
      public.org_role_of(public.application_org_id(application_id)) in ('owner', 'admin', 'casting_director')
      or (assignee_id = auth.uid() and public.can_review_org(public.application_org_id(application_id)))
    )
  );

create policy application_assignments_delete on public.application_assignments
  for delete to authenticated
  using (
    assignee_id = auth.uid()
    or public.org_role_of(public.application_org_id(application_id)) in ('owner', 'admin', 'casting_director')
  );

grant select, insert, update, delete on public.application_assignments to authenticated;
grant execute on function public.is_reviewer_of(uuid, uuid) to authenticated;
