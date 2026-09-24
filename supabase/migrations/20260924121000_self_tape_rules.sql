-- La self-tape : quand elle est exigée, et jusqu'à quand elle se remplace.
--
-- **Exigée ou non.** Tous les rôles ne demandent pas de tape — un figurant, une
-- silhouette, un rôle attribué sur photo. Le rôle le dit maintenant lui-même.
-- Et quand il l'exige, la candidature n'est pas finie tant que la tape n'est
-- pas là : elle reste en `draft`, visible du seul comédien, et bascule en
-- `submitted` à l'arrivée du fichier. Sans ça, une production reçoit des
-- candidatures vides et le comédien croit avoir postulé.
--
-- **Jusqu'à quand on remplace.** Une tape se refait : on se trouve mauvais, la
-- lumière était ratée, on a mieux compris la scène. Mais remplacer après une
-- décision change ce qui a été jugé — le vote de l'équipe porterait sur une
-- vidéo qui n'existe plus. Le remplacement s'arrête donc à la décision, sauf
-- si la production a explicitement redemandé une tape (callback `self_tape`) :
-- dans ce cas, c'est elle qui rouvre la porte.
--
-- Chaque envoi et chaque remplacement laisse un fait. `SELF_TAPE_REPLACED` est
-- au cahier des charges, et c'est ce qui permettra de dire « la tape qu'on a
-- notée n'est pas celle qu'on regarde aujourd'hui ».

alter table public.roles
  add column if not exists self_tape_required boolean not null default false;

comment on column public.roles.self_tape_required is
  'Le rôle exige une self-tape : la candidature reste en brouillon tant qu''elle manque.';

-- ── Une tape qui arrive termine la candidature ────────────────────────────

create or replace function public.on_self_tape_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app  public.applications;
  v_org  uuid;
begin
  select * into v_app from public.applications where id = new.application_id;

  -- Le rôle exigeait une tape : la candidature était en attente, elle part.
  if v_app.status = 'draft' then
    update public.applications
       set status = 'submitted',
           submitted_at = coalesce(submitted_at, now())
     where id = v_app.id;
  end if;

  v_org := public.application_org_id(new.application_id);

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, after)
  values ('SELF_TAPE_SUBMITTED', auth.uid(), 'self_tape', new.id, v_org, v_app.talent_id,
          jsonb_build_object('application_id', new.application_id));

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id, 'self_tape', 'A self-tape came in',
         coalesce((select r.name from public.roles r where r.id = v_app.role_id), 'A role'),
         'application', new.application_id
    from public.organization_members m
   where m.org_id = v_org and m.status = 'active';

  return new;
end;
$$;

revoke execute on function public.on_self_tape_submitted() from anon, authenticated, public;

drop trigger if exists self_tapes_on_submitted on public.self_tapes;
create trigger self_tapes_on_submitted
  after insert on public.self_tapes
  for each row execute function public.on_self_tape_submitted();

-- ── Remplacer : jusqu'à la décision, ou sur demande ───────────────────────

create or replace function public.guard_self_tape_replacement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.application_status;
  v_asked  boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.media_asset_id is not distinct from old.media_asset_id then
    return new;
  end if;

  select a.status into v_status from public.applications a where a.id = new.application_id;

  -- La production a redemandé une tape : elle rouvre la porte elle-même.
  select exists (
    select 1 from public.callbacks c
     where c.application_id = new.application_id
       and c.kind = 'self_tape'
       and c.response <> 'declined'
  ) into v_asked;

  if v_status in ('cast', 'not_selected', 'withdrawn') and not coalesce(v_asked, false) then
    raise exception 'This audition is closed — the production would have to ask for a new tape'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_self_tape_replacement() from anon, authenticated, public;

drop trigger if exists self_tapes_guard_replacement on public.self_tapes;
create trigger self_tapes_guard_replacement
  before update on public.self_tapes
  for each row execute function public.guard_self_tape_replacement();

create or replace function public.on_self_tape_replaced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent uuid;
begin
  if new.media_asset_id is not distinct from old.media_asset_id then
    return new;
  end if;

  select a.talent_id into v_talent from public.applications a where a.id = new.application_id;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, subject_id, before, after)
  values ('SELF_TAPE_REPLACED', auth.uid(), 'self_tape', new.id,
          public.application_org_id(new.application_id), v_talent,
          jsonb_build_object('media_asset_id', old.media_asset_id),
          jsonb_build_object('media_asset_id', new.media_asset_id));

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select m.profile_id, 'self_tape', 'A self-tape was replaced',
         'The talent sent a new take.', 'application', new.application_id
    from public.organization_members m
   where m.org_id = public.application_org_id(new.application_id) and m.status = 'active';

  return new;
end;
$$;

revoke execute on function public.on_self_tape_replaced() from anon, authenticated, public;

drop trigger if exists self_tapes_on_replaced on public.self_tapes;
create trigger self_tapes_on_replaced
  after update on public.self_tapes
  for each row execute function public.on_self_tape_replaced();

-- ── Une candidature en brouillon n'encombre pas la production ─────────────
--
-- Elle appartient au comédien tant qu'elle n'est pas partie : la policy de
-- lecture existante montre déjà les candidatures d'une organisation, on la
-- borne aux candidatures réellement envoyées.

drop policy if exists applications_read on public.applications;
create policy applications_read on public.applications
  for select to authenticated
  using (
    talent_id = auth.uid()
    or (status <> 'draft' and public.is_org_member(public.role_org_id(role_id)))
  );
