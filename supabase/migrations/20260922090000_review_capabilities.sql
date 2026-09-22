-- Roles inside an organization must mean something in the database too.
--
-- `is_org_member()` is true for a **viewer**, the read-only role, so a viewer
-- could vote on a candidate, write a team note and change a decision — the UI
-- hid the buttons, the database did not refuse the write. Measured with the
-- anon key in e2e/team-collaboration.spec.ts, which now asserts the refusal.
--
--   owner / admin / casting_director  decide, publish, manage
--   member                            review: vote, note, mark as viewed
--   viewer                            read only

/** Who may vote and take notes on a candidate. */
create or replace function public.can_review_org(p_org uuid)
returns boolean
language sql
stable
as $$
  select public.org_role_of(p_org) in ('owner', 'admin', 'casting_director', 'member');
$$;

drop policy if exists candidate_reviews_insert on public.candidate_reviews;
create policy candidate_reviews_insert on public.candidate_reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.can_review_org(public.application_org_id(application_id))
  );

drop policy if exists candidate_reviews_update on public.candidate_reviews;
create policy candidate_reviews_update on public.candidate_reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (
    reviewer_id = auth.uid()
    and public.can_review_org(public.application_org_id(application_id))
  );

drop policy if exists candidate_notes_insert on public.candidate_notes;
create policy candidate_notes_insert on public.candidate_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_review_org(public.application_org_id(application_id))
  );

/**
 * Decisions.
 *
 * The talent side keeps its own rules (draft / submitted / withdrawn). On the
 * production side, only a manager decides — except the one transition a
 * reviewer legitimately causes by opening a tape: submitted → viewed.
 */
create or replace function public.guard_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  talent_allowed application_status[] := array['draft', 'submitted', 'withdrawn']::application_status[];
  org uuid := public.role_org_id(old.role_id);
begin
  if new.status is distinct from old.status then
    if auth.uid() = old.talent_id and not public.is_org_member(org) then
      if not (new.status = any (talent_allowed)) then
        raise exception 'A talent cannot set application status to %', new.status
          using errcode = '42501';
      end if;
    elsif public.is_org_member(org) and not public.can_manage_org(org) then
      -- A reviewer may mark a submission as seen, and nothing else.
      if not (old.status = 'submitted' and new.status = 'viewed') then
        raise exception 'Your role cannot set application status to %', new.status
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;
