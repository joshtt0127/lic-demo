-- Let It Cast — Row Level Security.
--
-- Two rules drive everything:
--  1. A talent owns their own profile data and their own applications.
--  2. Production data (projects, castings, notes, reviews, self-tapes of candidates)
--     is scoped to the organization that owns the project. A talent never reads
--     a review, a note, or another candidate's self-tape.
--
-- Membership lookups go through security-definer helpers so policies never
-- recurse into the very table they protect.

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
     where m.org_id = p_org
       and m.profile_id = auth.uid()
       and m.status = 'active'
  );
$$;

create or replace function public.org_role_of(p_org uuid)
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.organization_members m
   where m.org_id = p_org
     and m.profile_id = auth.uid()
     and m.status = 'active';
$$;

/** Can create/edit projects, castings and roles. */
create or replace function public.can_manage_org(p_org uuid)
returns boolean
language sql
stable
as $$
  select public.org_role_of(p_org) in ('owner', 'admin', 'casting_director');
$$;

/** Can edit the organization itself and its members. */
create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
as $$
  select public.org_role_of(p_org) in ('owner', 'admin');
$$;

create or replace function public.casting_call_org_id(p_casting_call uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
    from public.casting_calls c
    join public.projects p on p.id = c.project_id
   where c.id = p_casting_call;
$$;

create or replace function public.role_org_id(p_role uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
    from public.roles r
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p on p.id = c.project_id
   where r.id = p_role;
$$;

create or replace function public.application_org_id(p_application uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
    from public.applications a
    join public.roles r on r.id = a.role_id
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p on p.id = c.project_id
   where a.id = p_application;
$$;

create or replace function public.application_talent_id(p_application uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.talent_id from public.applications a where a.id = p_application;
$$;

/** A role is visible to every authenticated user once its casting call is published. */
create or replace function public.role_is_public(p_role uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.roles r
      join public.casting_calls c on c.id = r.casting_call_id
     where r.id = p_role
       and c.status = 'published'
       and c.visibility = 'public'
  );
$$;

create or replace function public.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = p_conversation
       and cm.profile_id = auth.uid()
  );
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────────

alter table public.profiles              enable row level security;
alter table public.talent_profiles       enable row level security;
alter table public.production_profiles   enable row level security;
alter table public.skills                enable row level security;
alter table public.languages             enable row level security;
alter table public.talent_skills         enable row level security;
alter table public.talent_languages      enable row level security;
alter table public.credits               enable row level security;
alter table public.training              enable row level security;
alter table public.media_assets          enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.organization_invites  enable row level security;
alter table public.projects              enable row level security;
alter table public.project_members       enable row level security;
alter table public.casting_calls         enable row level security;
alter table public.roles                 enable row level security;
alter table public.applications          enable row level security;
alter table public.self_tapes            enable row level security;
alter table public.application_media     enable row level security;
alter table public.candidate_reviews     enable row level security;
alter table public.candidate_notes       enable row level security;
alter table public.saved_searches        enable row level security;
alter table public.saved_castings        enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.notifications         enable row level security;
alter table public.analytics_events      enable row level security;

-- ── Profiles ─────────────────────────────────────────────────────────────────

create policy profiles_read on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── Talent profile + its satellites ──────────────────────────────────────────
-- A professional profile is meant to be discoverable, so reads are open to
-- authenticated users; writes are owner-only.

create policy talent_profiles_read on public.talent_profiles
  for select to authenticated using (true);

create policy talent_profiles_write on public.talent_profiles
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy production_profiles_read on public.production_profiles
  for select to authenticated using (true);

create policy production_profiles_write on public.production_profiles
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy skills_read on public.skills for select to authenticated using (true);
create policy skills_insert on public.skills for insert to authenticated with check (true);
create policy languages_read on public.languages for select to authenticated using (true);

create policy talent_skills_read on public.talent_skills
  for select to authenticated using (true);
create policy talent_skills_write on public.talent_skills
  for all to authenticated using (talent_id = auth.uid()) with check (talent_id = auth.uid());

create policy talent_languages_read on public.talent_languages
  for select to authenticated using (true);
create policy talent_languages_write on public.talent_languages
  for all to authenticated using (talent_id = auth.uid()) with check (talent_id = auth.uid());

create policy credits_read on public.credits
  for select to authenticated using (true);
create policy credits_write on public.credits
  for all to authenticated using (talent_id = auth.uid()) with check (talent_id = auth.uid());

create policy training_read on public.training
  for select to authenticated using (true);
create policy training_write on public.training
  for all to authenticated using (talent_id = auth.uid()) with check (talent_id = auth.uid());

-- ── Media ────────────────────────────────────────────────────────────────────
-- Public-facing media (avatar, cover, headshots, portfolio, showreels, artwork)
-- is readable by any authenticated user. Self-tapes are readable by their owner
-- and by members of the organization that received the application.

create policy media_assets_read on public.media_assets
  for select to authenticated using (
    owner_id = auth.uid()
    or kind <> 'selftape'
    or exists (
      select 1
        from public.self_tapes st
       where st.media_asset_id = media_assets.id
         and public.is_org_member(public.application_org_id(st.application_id))
    )
  );

create policy media_assets_write on public.media_assets
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── Organizations ────────────────────────────────────────────────────────────

create policy organizations_read on public.organizations
  for select to authenticated using (true);

create policy organizations_insert on public.organizations
  for insert to authenticated with check (created_by = auth.uid());

create policy organizations_update on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy organization_members_read on public.organization_members
  for select to authenticated using (profile_id = auth.uid() or public.is_org_member(org_id));

-- Self-join (org creator adding themselves as owner, or accepting an invite)
-- and admin-managed membership.
create policy organization_members_insert on public.organization_members
  for insert to authenticated with check (profile_id = auth.uid() or public.is_org_admin(org_id));

create policy organization_members_update on public.organization_members
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy organization_members_delete on public.organization_members
  for delete to authenticated using (public.is_org_admin(org_id) or profile_id = auth.uid());

create policy organization_invites_read on public.organization_invites
  for select to authenticated using (
    public.is_org_member(org_id) or email = auth.email()
  );

create policy organization_invites_write on public.organization_invites
  for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- ── Projects ─────────────────────────────────────────────────────────────────
-- A project row is visible to its organization, and to everyone else only when
-- it carries at least one published casting call (talents need project context).

create policy projects_read on public.projects
  for select to authenticated using (
    public.is_org_member(org_id)
    or exists (
      select 1 from public.casting_calls c
       where c.project_id = projects.id
         and c.status = 'published'
         and c.visibility = 'public'
    )
  );

create policy projects_insert on public.projects
  for insert to authenticated with check (public.can_manage_org(org_id));

create policy projects_update on public.projects
  for update to authenticated using (public.can_manage_org(org_id)) with check (public.can_manage_org(org_id));

create policy projects_delete on public.projects
  for delete to authenticated using (public.is_org_admin(org_id));

create policy project_members_read on public.project_members
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_org_member((select p.org_id from public.projects p where p.id = project_id))
  );

create policy project_members_write on public.project_members
  for all to authenticated
  using (public.can_manage_org((select p.org_id from public.projects p where p.id = project_id)))
  with check (public.can_manage_org((select p.org_id from public.projects p where p.id = project_id)));

-- ── Casting calls & roles ────────────────────────────────────────────────────

create policy casting_calls_read on public.casting_calls
  for select to authenticated using (
    (status = 'published' and visibility = 'public')
    or public.is_org_member(public.casting_call_org_id(id))
  );

create policy casting_calls_insert on public.casting_calls
  for insert to authenticated
  with check (public.can_manage_org((select p.org_id from public.projects p where p.id = project_id)));

create policy casting_calls_update on public.casting_calls
  for update to authenticated
  using (public.can_manage_org(public.casting_call_org_id(id)))
  with check (public.can_manage_org(public.casting_call_org_id(id)));

create policy casting_calls_delete on public.casting_calls
  for delete to authenticated using (public.can_manage_org(public.casting_call_org_id(id)));

create policy roles_read on public.roles
  for select to authenticated using (
    public.role_is_public(id) or public.is_org_member(public.role_org_id(id))
  );

create policy roles_insert on public.roles
  for insert to authenticated
  with check (public.can_manage_org(public.casting_call_org_id(casting_call_id)));

create policy roles_update on public.roles
  for update to authenticated
  using (public.can_manage_org(public.role_org_id(id)))
  with check (public.can_manage_org(public.role_org_id(id)));

create policy roles_delete on public.roles
  for delete to authenticated using (public.can_manage_org(public.role_org_id(id)));

-- ── Applications ─────────────────────────────────────────────────────────────

create policy applications_read on public.applications
  for select to authenticated using (
    talent_id = auth.uid() or public.is_org_member(public.role_org_id(role_id))
  );

create policy applications_insert on public.applications
  for insert to authenticated
  with check (talent_id = auth.uid() and public.role_is_public(role_id));

-- Both sides may update; a trigger (below) restricts which statuses each side
-- is allowed to set.
create policy applications_update on public.applications
  for update to authenticated
  using (talent_id = auth.uid() or public.is_org_member(public.role_org_id(role_id)))
  with check (talent_id = auth.uid() or public.is_org_member(public.role_org_id(role_id)));

create policy applications_delete on public.applications
  for delete to authenticated using (talent_id = auth.uid() and status = 'draft');

/**
 * The talent may only move their own application between draft / submitted /
 * withdrawn. Every decision status belongs to the production side.
 */
create or replace function public.guard_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  talent_allowed application_status[] := array['draft', 'submitted', 'withdrawn']::application_status[];
begin
  if new.status is distinct from old.status
     and auth.uid() = old.talent_id
     and not public.is_org_member(public.role_org_id(old.role_id))
     and not (new.status = any (talent_allowed))
  then
    raise exception 'A talent cannot set application status to %', new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger applications_guard_status
  before update on public.applications
  for each row execute function public.guard_application_status();

-- ── Self-tapes & attached media ──────────────────────────────────────────────

create policy self_tapes_read on public.self_tapes
  for select to authenticated using (
    public.application_talent_id(application_id) = auth.uid()
    or public.is_org_member(public.application_org_id(application_id))
  );

create policy self_tapes_write on public.self_tapes
  for all to authenticated
  using (public.application_talent_id(application_id) = auth.uid())
  with check (public.application_talent_id(application_id) = auth.uid());

create policy application_media_read on public.application_media
  for select to authenticated using (
    public.application_talent_id(application_id) = auth.uid()
    or public.is_org_member(public.application_org_id(application_id))
  );

create policy application_media_write on public.application_media
  for all to authenticated
  using (public.application_talent_id(application_id) = auth.uid())
  with check (public.application_talent_id(application_id) = auth.uid());

-- ── Reviews & notes — production only, never the talent ──────────────────────

create policy candidate_reviews_read on public.candidate_reviews
  for select to authenticated using (public.is_org_member(public.application_org_id(application_id)));

create policy candidate_reviews_insert on public.candidate_reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.is_org_member(public.application_org_id(application_id))
  );

create policy candidate_reviews_update on public.candidate_reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

create policy candidate_reviews_delete on public.candidate_reviews
  for delete to authenticated using (reviewer_id = auth.uid());

create policy candidate_notes_read on public.candidate_notes
  for select to authenticated using (
    public.is_org_member(public.application_org_id(application_id))
    and (visibility = 'team' or author_id = auth.uid())
  );

create policy candidate_notes_insert on public.candidate_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_org_member(public.application_org_id(application_id))
  );

create policy candidate_notes_update on public.candidate_notes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy candidate_notes_delete on public.candidate_notes
  for delete to authenticated using (author_id = auth.uid());

-- ── Saved searches / saved castings ──────────────────────────────────────────

create policy saved_searches_own on public.saved_searches
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy saved_castings_own on public.saved_castings
  for all to authenticated using (talent_id = auth.uid()) with check (talent_id = auth.uid());

-- ── Messaging ────────────────────────────────────────────────────────────────

create policy conversations_read on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

create policy conversations_insert on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

create policy conversations_update on public.conversations
  for update to authenticated using (public.is_conversation_member(id)) with check (public.is_conversation_member(id));

create policy conversation_members_read on public.conversation_members
  for select to authenticated using (
    profile_id = auth.uid() or public.is_conversation_member(conversation_id)
  );

-- The creator seeds the member list right after inserting the conversation;
-- afterwards only existing members can add someone.
create policy conversation_members_insert on public.conversation_members
  for insert to authenticated with check (
    profile_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or exists (
      select 1 from public.conversations c
       where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

create policy conversation_members_update on public.conversation_members
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy messages_read on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- ── Notifications ────────────────────────────────────────────────────────────
-- Rows are produced by database triggers (security definer); clients only read
-- their own and flip read_at.

create policy notifications_read on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ── Analytics ────────────────────────────────────────────────────────────────

create policy analytics_insert on public.analytics_events
  for insert to authenticated with check (profile_id is null or profile_id = auth.uid());
