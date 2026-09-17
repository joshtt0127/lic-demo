-- Two things the studio design needs, and neither can be faked:
--
--  1. An editable status per role. The rest of a role's state is derived from
--     its candidates, but "is this role still open" is a decision the casting
--     director makes, so it gets a column.
--  2. Bookmarked talents — the production side's own shortlist of people,
--     independent of any casting.

create type role_status as enum ('open', 'reviewing', 'callbacks', 'booked', 'closed');

alter table public.roles
  add column status role_status not null default 'open';

comment on column public.roles.status is
  'Set by the production team. Submission counts and shortlists are derived, this is a decision.';

create table public.saved_talents (
  production_id uuid not null references public.profiles (id) on delete cascade,
  talent_id     uuid not null references public.talent_profiles (profile_id) on delete cascade,
  note          text,
  created_at    timestamptz not null default now(),
  primary key (production_id, talent_id)
);

alter table public.saved_talents enable row level security;

create policy saved_talents_own on public.saved_talents
  for all to authenticated
  using (production_id = auth.uid())
  with check (production_id = auth.uid());
