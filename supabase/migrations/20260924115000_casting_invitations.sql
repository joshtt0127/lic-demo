-- Les castings sur invitation.
--
-- `invite_only` existait dans l'énumération depuis la migration précédente,
-- sans rien ouvrir : faute de savoir qui est invité, l'annonce restait invisible
-- de tout le monde. Voici ce qui manquait.
--
-- À quoi ça sert, concrètement : une production cherche un rôle sans publier
-- l'annonce — un remplacement de dernière minute, un projet sous embargo, une
-- liste courte constituée à la main. Elle invite trois comédiens repérés dans
-- l'annuaire ; eux seuls voient l'annonce, et peuvent candidater.
--
-- Deux choses qu'on ne fait pas :
--   · l'invitation **ne candidate pas** à la place du comédien. Elle lui ouvre
--     la porte, il décide d'entrer. Postuler pour quelqu'un d'autre serait une
--     autre promesse, et un autre problème de consentement ;
--   · elle ne se devine pas. Comme pour une organisation, connaître un
--     identifiant ne suffit pas : il faut une ligne d'invitation à son nom.

create table if not exists public.casting_invites (
  id              uuid primary key default gen_random_uuid(),
  casting_call_id uuid not null references public.casting_calls (id) on delete cascade,
  talent_id       uuid not null references public.profiles (id) on delete cascade,
  invited_by      uuid references public.profiles (id) on delete set null,
  message         text,
  created_at      timestamptz not null default now(),
  unique (casting_call_id, talent_id)
);

comment on table public.casting_invites is
  'Qui a le droit de voir un casting sur invitation. N''implique aucune candidature.';

create index if not exists casting_invites_talent_idx on public.casting_invites (talent_id);

alter table public.casting_invites enable row level security;

/** Ce comédien est-il invité sur ce casting ? */
create or replace function public.is_invited_to_casting(p_casting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casting_invites i
     where i.casting_call_id = p_casting and i.talent_id = auth.uid()
  );
$$;

revoke execute on function public.is_invited_to_casting(uuid) from anon, public;
grant execute on function public.is_invited_to_casting(uuid) to authenticated;

-- L'organisation gère ses invitations ; l'invité voit la sienne.
drop policy if exists casting_invites_read on public.casting_invites;
create policy casting_invites_read on public.casting_invites
  for select to authenticated
  using (
    talent_id = auth.uid()
    or public.is_org_member(public.casting_call_org_id(casting_call_id))
  );

drop policy if exists casting_invites_write on public.casting_invites;
create policy casting_invites_write on public.casting_invites
  for all to authenticated
  using (public.can_manage_org(public.casting_call_org_id(casting_call_id)))
  with check (public.can_manage_org(public.casting_call_org_id(casting_call_id)));

-- ── Ce que l'invitation ouvre ──────────────────────────────────────────────

drop policy if exists casting_calls_read on public.casting_calls;
create policy casting_calls_read on public.casting_calls
  for select to authenticated
  using (
    (status = 'published' and visibility in ('public', 'private_link'))
    or (status = 'published' and visibility = 'invite_only' and public.is_invited_to_casting(id))
    or public.is_org_member(public.project_org_id(project_id))
    or public.talent_applied_to_casting(id)
  );

-- Le nom du paramètre d'origine est conservé : PostgreSQL refuse de le changer
-- par un `create or replace`, et le renommer demanderait de supprimer la
-- fonction dont dépendent des policies existantes.
/** Un rôle est lisible si son casting l'est — invitation comprise. */
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
       and (
         c.visibility in ('public', 'private_link')
         or (c.visibility = 'invite_only' and public.is_invited_to_casting(c.id))
       )
  );
$$;

-- ── Être invité, ça se sait ────────────────────────────────────────────────

create or replace function public.notify_casting_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_org   text;
begin
  select c.title, o.name
    into v_title, v_org
    from public.casting_calls c
    join public.projects p on p.id = c.project_id
    join public.organizations o on o.id = p.org_id
   where c.id = new.casting_call_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  values (
    new.talent_id,
    'casting_invite',
    coalesce(v_org, 'A production') || ' invited you to audition',
    coalesce(nullif(new.message, ''), coalesce(v_title, 'A casting')),
    'casting_call',
    new.casting_call_id
  );

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id)
  values ('CASTING_INVITED', auth.uid(), 'casting_call', new.casting_call_id,
          public.casting_call_org_id(new.casting_call_id), new.talent_id);

  return new;
end;
$$;

revoke execute on function public.notify_casting_invite() from anon, authenticated, public;

drop trigger if exists casting_invites_notify on public.casting_invites;
create trigger casting_invites_notify
  after insert on public.casting_invites
  for each row execute function public.notify_casting_invite();
