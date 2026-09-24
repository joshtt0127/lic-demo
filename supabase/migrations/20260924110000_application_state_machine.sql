-- La machine à états des candidatures, et sa mémoire.
--
-- Jusqu'ici, la base vérifiait **qui** pouvait changer un statut, jamais **vers
-- quoi**. Une candidature pouvait donc passer de `submitted` à `cast` sans
-- avoir été regardée, revenir de `cast` à `draft`, ou repartir dans n'importe
-- quel sens : l'audit l'a relevé, et c'est le genre d'incohérence qui se
-- découvre le jour d'un litige.
--
-- Deux choses arrivent ici :
--
--   1. **Les transitions sont déclarées.** Une table, pas du code éparpillé :
--      on peut la lire, la tester, et l'expliquer à quelqu'un.
--
--   2. **Rien ne s'écrase plus en silence.** Chaque changement de statut écrit
--      un fait dans `events` — qui, quand, de quoi vers quoi. L'état courant
--      reste dans `applications` ; l'histoire vit à côté. C'est la distinction
--      que le cahier des charges appelle CURRENT STATE / HISTORICAL EVENT, et
--      c'est ce qui permettra plus tard de répondre à « pourquoi cette
--      candidature a-t-elle été refusée le 12 ? ».
--
-- Ce que cette migration ne fait pas : l'analyse dérivée, le consentement, la
-- rétention. `events` est volontairement minimal — un fait, son acteur, son
-- avant/après. On l'étendra quand la Phase 8 le demandera, pas avant.

-- ── Les faits ──────────────────────────────────────────────────────────────

create table if not exists public.events (
  id           bigserial primary key,
  type         text not null,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references public.profiles (id) on delete set null,
  entity_type  text not null,
  entity_id    uuid not null,
  org_id       uuid references public.organizations (id) on delete set null,
  subject_id   uuid references public.profiles (id) on delete set null,
  before       jsonb,
  after        jsonb,
  source       text not null default 'app',
  metadata     jsonb not null default '{}'::jsonb
);

comment on table public.events is
  'Faits canoniques du workflow. Append-only : on n''y modifie ni n''y supprime rien.';
comment on column public.events.subject_id is
  'La personne concernée par le fait (le comédien), distincte de son auteur.';
comment on column public.events.source is
  'app | system | admin — d''où vient le fait. Les données dérivées (IA) ne sont pas des faits.';

create index if not exists events_entity_idx on public.events (entity_type, entity_id, occurred_at desc);
create index if not exists events_org_idx on public.events (org_id, occurred_at desc);
create index if not exists events_subject_idx on public.events (subject_id, occurred_at desc);

alter table public.events enable row level security;

-- Lecture : l'organisation concernée, et la personne concernée. Personne d'autre.
drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select to authenticated
  using (
    subject_id = auth.uid()
    or (org_id is not null and public.is_org_member(org_id))
  );

-- Aucune policy d'écriture : les faits sont écrits par des triggers
-- `security definer`. Un client ne forge pas l'histoire.

-- ── Les transitions ────────────────────────────────────────────────────────

create table if not exists public.application_transitions (
  from_status public.application_status not null,
  to_status   public.application_status not null,
  /** `manage` = owner/admin ; `review` = + member ; `talent` = le comédien. */
  actor       text not null check (actor in ('talent', 'review', 'manage')),
  /** Un retour en arrière assumé : autorisé, mais toujours tracé. */
  is_reversal boolean not null default false,
  primary key (from_status, to_status, actor)
);

comment on table public.application_transitions is
  'La machine à états, déclarée. Toute transition absente d''ici est refusée.';

alter table public.application_transitions enable row level security;
drop policy if exists application_transitions_read on public.application_transitions;
create policy application_transitions_read on public.application_transitions
  for select to authenticated using (true);

delete from public.application_transitions;
insert into public.application_transitions (from_status, to_status, actor, is_reversal) values
  -- Le comédien : il envoie, et il se retire.
  ('draft',        'submitted',    'talent', false),
  ('submitted',    'withdrawn',    'talent', false),
  ('viewed',       'withdrawn',    'talent', false),
  ('under_review', 'withdrawn',    'talent', false),
  ('shortlisted',  'withdrawn',    'talent', false),
  ('callback',     'withdrawn',    'talent', false),

  -- Un membre de l'équipe : il ouvre la candidature, rien de plus.
  ('submitted',    'viewed',       'review', false),

  -- Qui décide : la progression.
  ('submitted',    'viewed',       'manage', false),
  ('submitted',    'under_review', 'manage', false),
  ('submitted',    'shortlisted',  'manage', false),
  ('submitted',    'not_selected', 'manage', false),
  ('viewed',       'under_review', 'manage', false),
  ('viewed',       'shortlisted',  'manage', false),
  ('viewed',       'not_selected', 'manage', false),
  ('under_review', 'shortlisted',  'manage', false),
  ('under_review', 'not_selected', 'manage', false),
  ('shortlisted',  'callback',     'manage', false),
  ('shortlisted',  'offer',        'manage', false),
  ('shortlisted',  'cast',         'manage', false),
  ('shortlisted',  'not_selected', 'manage', false),
  ('callback',     'offer',        'manage', false),
  ('callback',     'cast',         'manage', false),
  ('callback',     'not_selected', 'manage', false),
  ('offer',        'cast',         'manage', false),
  ('offer',        'not_selected', 'manage', false),

  -- Les retours en arrière assumés. Une production se trompe, et un comédien
  -- écarté par erreur doit pouvoir revenir — mais jamais en silence.
  ('not_selected', 'under_review', 'manage', true),
  ('not_selected', 'shortlisted',  'manage', true),
  ('shortlisted',  'under_review', 'manage', true),
  ('callback',     'shortlisted',  'manage', true),
  -- Un rôle attribué peut se défaire (désistement, changement de plan), mais on
  -- ne repart jamais vers un brouillon ou une candidature « pas encore vue ».
  ('cast',         'shortlisted',  'manage', true),
  ('cast',         'not_selected', 'manage', true);

-- ── Le garde ───────────────────────────────────────────────────────────────

create or replace function public.guard_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_actor text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Service role : reprises, fixtures, opérations d'exploitation.
  if auth.uid() is null then
    return new;
  end if;

  v_org := public.role_org_id(old.role_id);

  if auth.uid() = old.talent_id and not public.is_org_member(v_org) then
    v_actor := 'talent';
  elsif public.can_manage_org(v_org) then
    v_actor := 'manage';
  elsif public.can_review_org(v_org) then
    v_actor := 'review';
  else
    raise exception 'You cannot change this application' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.application_transitions t
     where t.from_status = old.status
       and t.to_status = new.status
       and t.actor = v_actor
  ) then
    raise exception 'A % cannot move an application from % to %', v_actor, old.status, new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_application_status() from anon, authenticated, public;

-- ── La mémoire ─────────────────────────────────────────────────────────────

/**
 * Chaque changement de statut devient un fait.
 *
 * Le type de l'événement suit le vocabulaire du cahier des charges
 * (`SHORTLISTED`, `PASSED`, `CAST`…) plutôt que le nom de la colonne : c'est ce
 * qu'on relira dans deux ans.
 */
create or replace function public.record_application_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := case when new.status = 'submitted' then 'APPLICATION_SUBMITTED'
                   else 'APPLICATION_CREATED' end;
    insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, after)
    values (v_type, auth.uid(), 'application', new.id, public.role_org_id(new.role_id),
            new.talent_id, jsonb_build_object('status', new.status));
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_type := case new.status
    when 'submitted'    then 'APPLICATION_SUBMITTED'
    when 'viewed'       then 'SUBMISSION_OPENED'
    when 'under_review' then 'SUBMISSION_REVIEWED'
    when 'shortlisted'  then 'SHORTLISTED'
    when 'callback'     then 'CALLBACK_REQUESTED'
    when 'offer'        then 'OFFER_MADE'
    when 'cast'         then 'CAST'
    when 'not_selected' then 'PASSED'
    when 'withdrawn'    then 'APPLICATION_WITHDRAWN'
    else 'APPLICATION_STATUS_CHANGED'
  end;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, before, after, metadata)
  values (
    v_type,
    auth.uid(),
    'application',
    new.id,
    public.role_org_id(new.role_id),
    new.talent_id,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status),
    jsonb_build_object(
      'reversal',
      exists (
        select 1 from public.application_transitions t
         where t.from_status = old.status and t.to_status = new.status and t.is_reversal
      )
    )
  );

  return new;
end;
$$;

revoke execute on function public.record_application_event() from anon, authenticated, public;

drop trigger if exists applications_record_event on public.applications;
create trigger applications_record_event
  after insert or update of status on public.applications
  for each row execute function public.record_application_event();
