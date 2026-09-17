-- Let It Cast — POC schema.
--
-- Design notes:
--  * `applications` is the pivot entity. What a talent sees in "Auditions" and what a
--    production sees in "Candidates" is the SAME row — there is no mirrored table.
--  * Searchable talent attributes (skills, languages, credits, training, media) are
--    relational, not JSON. Only UI snapshots (saved-search filters) stay jsonb.
--  * Every file lives in `media_assets`; business tables reference an asset, never a raw URL.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────

create type account_type          as enum ('talent', 'production');
create type org_role              as enum ('owner', 'admin', 'casting_director', 'member', 'viewer');
create type member_status         as enum ('active', 'invited', 'removed');
create type project_status        as enum ('draft', 'casting', 'callbacks', 'pre_production', 'cast', 'archived');
create type casting_status        as enum ('draft', 'published', 'closed', 'archived');
create type casting_visibility    as enum ('public', 'private');
create type casting_format        as enum ('scripted', 'non_scripted');
create type role_type             as enum ('lead', 'supporting', 'contestant');
create type audition_flow         as enum ('open_call', 'invited', 'in_house');
create type application_status    as enum (
  'draft', 'submitted', 'viewed', 'under_review', 'shortlisted',
  'callback', 'offer', 'cast', 'not_selected', 'withdrawn'
);
create type review_vote           as enum ('no', 'maybe', 'good');
create type media_kind            as enum ('avatar', 'cover', 'headshot', 'portfolio', 'showreel', 'selftape', 'poster', 'logo');
create type note_visibility       as enum ('team', 'private');
create type conversation_context  as enum ('application', 'project', 'casting_call', 'role', 'direct');
create type availability_status   as enum ('available', 'on_project', 'unavailable');

-- ── Shared trigger ───────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Profiles ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  account_type          account_type,
  first_name            text,
  last_name             text,
  avatar_url            text,
  locale                text not null default 'en' check (locale in ('en', 'fr')),
  city                  text,
  country               text,
  onboarding_step       text,
  onboarding_completed_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. account_type drives which experience the user lands in.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create the profile row when a user signs up. account_type / names come from
-- the sign-up metadata when present; the onboarding fills the rest.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, account_type, first_name, last_name, locale)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'account_type', '')::account_type,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Talent ───────────────────────────────────────────────────────────────────

create table public.talent_profiles (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  professional_name text,
  headline          text,
  bio               text,
  cover_url         text,
  gender            text,
  ethnicities       text[] not null default '{}',
  playing_age_min   smallint check (playing_age_min between 0 and 120),
  playing_age_max   smallint check (playing_age_max between 0 and 120),
  height_cm         smallint check (height_cm between 50 and 260),
  nationalities     text[] not null default '{}',
  accents           text[] not null default '{}',
  union_name        text,
  -- Free-form seniority tag used by the production-side filters
  -- ("Emerging", "Mid-career", "Established", "Star", or a show-specific label).
  experience_level  text,
  availability      availability_status not null default 'available',
  website           text,
  agency_name       text,
  agent_name        text,
  agent_email       text,
  agent_phone       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint playing_age_coherent check (
    playing_age_min is null or playing_age_max is null or playing_age_min <= playing_age_max
  )
);

create trigger talent_profiles_updated_at before update on public.talent_profiles
  for each row execute function public.set_updated_at();

create table public.production_profiles (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  job_title   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger production_profiles_updated_at before update on public.production_profiles
  for each row execute function public.set_updated_at();

-- Reference tables (autocomplete + canonical naming)
create table public.skills (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  category text
);

create table public.languages (
  code text primary key,
  name text not null
);

create table public.talent_skills (
  talent_id uuid not null references public.talent_profiles (profile_id) on delete cascade,
  skill_id  uuid not null references public.skills (id) on delete cascade,
  level     smallint not null default 2 check (level between 1 and 3),
  primary key (talent_id, skill_id)
);

create table public.talent_languages (
  talent_id uuid not null references public.talent_profiles (profile_id) on delete cascade,
  language  text not null references public.languages (code) on delete cascade,
  fluency   text,
  primary key (talent_id, language)
);

create table public.credits (
  id          uuid primary key default gen_random_uuid(),
  talent_id   uuid not null references public.talent_profiles (profile_id) on delete cascade,
  title       text not null,
  role_name   text,
  category    text,
  year        text,
  director    text,
  company     text,
  location    text,
  url         text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index credits_talent_idx on public.credits (talent_id, sort_order);

create table public.training (
  id          uuid primary key default gen_random_uuid(),
  talent_id   uuid not null references public.talent_profiles (profile_id) on delete cascade,
  school      text not null,
  program     text,
  start_year  text,
  end_year    text,
  description text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index training_talent_idx on public.training (talent_id, sort_order);

-- ── Media ────────────────────────────────────────────────────────────────────

create table public.media_assets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  kind        media_kind not null,
  bucket      text not null,
  path        text not null,
  mime        text,
  bytes       bigint,
  width       int,
  height      int,
  duration_s  numeric(8, 2),
  caption     text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (bucket, path)
);

comment on table public.media_assets is 'Every uploaded file. selftape assets live in the private bucket.';

create index media_assets_owner_idx on public.media_assets (owner_id, kind, sort_order);

-- ── Organizations ────────────────────────────────────────────────────────────

create table public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  logo_url     text,
  description  text,
  website      text,
  company_type text,
  city         text,
  country      text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       org_role not null default 'member',
  status     member_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (org_id, profile_id)
);

create index organization_members_profile_idx on public.organization_members (profile_id, status);

create table public.organization_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null,
  role        org_role not null default 'member',
  token       text not null unique default encode(gen_random_bytes(18), 'hex'),
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

-- ── Projects / castings / roles ───────────────────────────────────────────────

create table public.projects (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  title                 text not null,
  subtitle              text,
  synopsis              text,
  director_brief        text,
  production_type       text,
  genre                 text,
  company_name          text,
  director_name         text,
  casting_director_name text,
  poster_url            text,
  shooting_location     text,
  shooting_start        date,
  shooting_end          date,
  status                project_status not null default 'draft',
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint shooting_dates_coherent check (
    shooting_start is null or shooting_end is null or shooting_start <= shooting_end
  )
);

create index projects_org_idx on public.projects (org_id, status);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create table public.casting_calls (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  description   text,
  location      text,
  deadline_at   timestamptz,
  compensation  text,
  visibility    casting_visibility not null default 'public',
  format        casting_format not null default 'scripted',
  status        casting_status not null default 'draft',
  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index casting_calls_project_idx on public.casting_calls (project_id, status);
create index casting_calls_status_idx on public.casting_calls (status, deadline_at);

create trigger casting_calls_updated_at before update on public.casting_calls
  for each row execute function public.set_updated_at();

create table public.roles (
  id                    uuid primary key default gen_random_uuid(),
  casting_call_id       uuid not null references public.casting_calls (id) on delete cascade,
  name                  text not null,
  description           text,
  role_type             role_type not null default 'supporting',
  gender_pref           text,
  playing_age_min       smallint check (playing_age_min between 0 and 120),
  playing_age_max       smallint check (playing_age_max between 0 and 120),
  location              text,
  languages             text[] not null default '{}',
  accents               text[] not null default '{}',
  skills                text[] not null default '{}',
  requirements          text,
  compensation          text,
  selftape_instructions text,
  sides_url             text,
  shooting_start        date,
  shooting_end          date,
  audition_flow         audition_flow not null default 'open_call',
  sort_order            smallint not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint role_playing_age_coherent check (
    playing_age_min is null or playing_age_max is null or playing_age_min <= playing_age_max
  )
);

create index roles_casting_idx on public.roles (casting_call_id, sort_order);
create index roles_skills_idx on public.roles using gin (skills);

create trigger roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

-- ── Applications (pivot) ─────────────────────────────────────────────────────

create table public.applications (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references public.roles (id) on delete cascade,
  talent_id    uuid not null references public.talent_profiles (profile_id) on delete cascade,
  status       application_status not null default 'draft',
  note         text,
  headshot_id  uuid references public.media_assets (id) on delete set null,
  showreel_id  uuid references public.media_assets (id) on delete set null,
  submitted_at timestamptz,
  viewed_at    timestamptz,
  decided_at   timestamptz,
  source       text not null default 'talent_apply',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (role_id, talent_id)
);

comment on table public.applications is
  'Single source of truth shared by Talent > Auditions and Studio > Candidates.';

create index applications_role_idx on public.applications (role_id, status);
create index applications_talent_idx on public.applications (talent_id, status);

create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create table public.self_tapes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  media_asset_id  uuid not null references public.media_assets (id) on delete cascade,
  duration_s      numeric(8, 2),
  submitted_at    timestamptz not null default now(),
  unique (application_id, media_asset_id)
);

create table public.application_media (
  application_id uuid not null references public.applications (id) on delete cascade,
  media_asset_id uuid not null references public.media_assets (id) on delete cascade,
  primary key (application_id, media_asset_id)
);

create table public.candidate_reviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  reviewer_id    uuid not null references public.profiles (id) on delete cascade,
  vote           review_vote not null,
  comment        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (application_id, reviewer_id)
);

create index candidate_reviews_application_idx on public.candidate_reviews (application_id);

create trigger candidate_reviews_updated_at before update on public.candidate_reviews
  for each row execute function public.set_updated_at();

create table public.candidate_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body           text not null,
  visibility     note_visibility not null default 'team',
  created_at     timestamptz not null default now()
);

create index candidate_notes_application_idx on public.candidate_notes (application_id, created_at desc);

-- ── Saved searches / saved castings ──────────────────────────────────────────

create table public.saved_searches (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  name        text not null,
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index saved_searches_owner_idx on public.saved_searches (owner_id, project_id);

create table public.saved_castings (
  talent_id       uuid not null references public.talent_profiles (profile_id) on delete cascade,
  casting_call_id uuid not null references public.casting_calls (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (talent_id, casting_call_id)
);

-- ── Messaging ────────────────────────────────────────────────────────────────

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  subject         text,
  context_type    conversation_context not null default 'direct',
  context_id      uuid,
  org_id          uuid references public.organizations (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index conversations_context_idx on public.conversations (context_type, context_id);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index conversation_members_profile_idx on public.conversation_members (profile_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Keep `last_message_at` in sync so conversation lists sort without a subquery.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ── Notifications / analytics ────────────────────────────────────────────────

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

create table public.analytics_events (
  id         bigserial primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_name_idx on public.analytics_events (name, created_at desc);
