-- The Wall™ — le mur de casting d'un projet.
--
-- Une carte par rôle, un comédien retenu par carte. Ce qui est posé sur le mur
-- est un choix de travail de l'équipe, pas une décision de casting : la
-- sélection vit dans sa propre table et ne touche jamais au statut de la
-- candidature (`applications.status = 'cast'` reste la seule décision ferme).
--
--   · roles.role_group        groupe libre (« La famille Parc », « L'hôpital »)
--   · projects.wall_order     ordre choisi à la main ; null = ordre d'importance
--   · wall_selections         la sélection active, une par rôle
--   · wall_selection_history  qui a changé quoi, quand (journal append-only)
--   · tape_stills             l'image tirée de la self-tape, rangée dans le
--                             bucket privé `tape-stills` (<org>/<self_tape>.jpg)
--
-- Droits, sans nouveau système : toute l'équipe voit le mur
-- (`is_org_member`), ceux qui peuvent reviewer le modifient (`can_review_org`),
-- et la décision ferme reste celle de `candidate:decide`.

-- ── Rôles : groupe libre ─────────────────────────────────────────────────────

alter table public.roles
  add column if not exists role_group text
  check (role_group is null or char_length(role_group) between 1 and 40);

comment on column public.roles.role_group is
  'Groupe de rôles propre à la production, en plus de lead / supporting / small.';

-- ── Projet : ordre du mur ────────────────────────────────────────────────────

alter table public.projects add column if not exists wall_order uuid[];

comment on column public.projects.wall_order is
  'Ordre des cartes choisi par l''équipe. Null : ordre d''importance des rôles.';

/** L'organisation d'un projet — lue depuis la clé portée par la ligne. */
create or replace function public.project_org_id(p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.projects where id = p_project;
$$;

/** Nom affiché d'un comédien sur une candidature (même règle que v_candidates). */
create or replace function public.application_display_name(p_application uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(tp.professional_name, ''),
                  nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                  'Unnamed talent')
    from public.applications a
    join public.profiles p on p.id = a.talent_id
    left join public.talent_profiles tp on tp.profile_id = a.talent_id
   where a.id = p_application;
$$;

-- ── Sélection active ─────────────────────────────────────────────────────────

create table public.wall_selections (
  role_id         uuid primary key references public.roles (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  selected_by     uuid references public.profiles (id) on delete set null,
  selected_at     timestamptz not null default now()
);

create index wall_selections_project on public.wall_selections (project_id);

-- ── Journal ──────────────────────────────────────────────────────────────────

create table public.wall_selection_history (
  id                       bigint generated always as identity primary key,
  role_id                  uuid not null references public.roles (id) on delete cascade,
  project_id               uuid not null references public.projects (id) on delete cascade,
  previous_application_id  uuid references public.applications (id) on delete set null,
  new_application_id       uuid references public.applications (id) on delete set null,
  -- Les noms sont figés au moment du changement : l'historique reste lisible
  -- même si une candidature disparaît plus tard.
  previous_name            text,
  new_name                 text,
  changed_by               uuid references public.profiles (id) on delete set null,
  changed_at               timestamptz not null default now()
);

create index wall_selection_history_role on public.wall_selection_history (role_id, changed_at desc);
create index wall_selection_history_project on public.wall_selection_history (project_id, changed_at desc);

alter table public.wall_selections enable row level security;
alter table public.wall_selection_history enable row level security;

create policy wall_selections_read on public.wall_selections
  for select to authenticated
  using (public.is_org_member(public.project_org_id(project_id)));

create policy wall_selection_history_read on public.wall_selection_history
  for select to authenticated
  using (public.is_org_member(public.project_org_id(project_id)));

-- Aucune écriture directe : tout passe par set_wall_selection(), qui vérifie
-- les droits et la validité de l'audition et écrit le journal dans la même
-- transaction.
revoke all on public.wall_selections, public.wall_selection_history from anon;
grant select on public.wall_selections, public.wall_selection_history to authenticated;

/**
 * Poser (ou retirer, avec p_application = null) un comédien sur la carte d'un rôle.
 *
 * Refuse : un rôle introuvable, quelqu'un qui ne peut pas reviewer dans cette
 * production, une candidature d'un autre rôle, un brouillon, un retrait, ou
 * une candidature sans self-tape (le mur est fait de performances).
 */
create or replace function public.set_wall_selection(p_role uuid, p_application uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_org     uuid;
  v_prev    uuid;
begin
  select c.project_id, p.org_id
    into v_project, v_org
    from public.roles r
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p on p.id = c.project_id
   where r.id = p_role;

  if v_project is null then
    raise exception 'This role does not exist' using errcode = 'P0002';
  end if;
  if not public.can_review_org(v_org) then
    raise exception 'Your role in this production cannot change the Wall' using errcode = '42501';
  end if;
  if p_application is not null and not exists (
    select 1
      from public.applications a
     where a.id = p_application
       and a.role_id = p_role
       and a.status not in ('draft', 'withdrawn')
       and exists (select 1 from public.self_tapes st where st.application_id = a.id)
  ) then
    raise exception 'Only a submitted audition for this role can go on its card' using errcode = '22023';
  end if;

  select application_id into v_prev
    from public.wall_selections
   where role_id = p_role
     for update;

  if v_prev is not distinct from p_application then
    return;
  end if;

  if p_application is null then
    delete from public.wall_selections where role_id = p_role;
  else
    insert into public.wall_selections (role_id, project_id, application_id, selected_by, selected_at)
    values (p_role, v_project, p_application, auth.uid(), now())
    on conflict (role_id) do update
      set application_id = excluded.application_id,
          selected_by    = excluded.selected_by,
          selected_at    = excluded.selected_at;
  end if;

  insert into public.wall_selection_history
    (role_id, project_id, previous_application_id, new_application_id, previous_name, new_name, changed_by)
  values
    (p_role, v_project, v_prev, p_application,
     case when v_prev is null then null else public.application_display_name(v_prev) end,
     case when p_application is null then null else public.application_display_name(p_application) end,
     auth.uid());
end;
$$;

/**
 * L'ordre des cartes choisi par l'équipe. Les identifiants étrangers au projet
 * sont ignorés ; un tableau vide (ou null) rend l'ordre d'importance.
 */
create or replace function public.set_wall_order(p_project uuid, p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := public.project_org_id(p_project);
  v_clean uuid[];
begin
  if v_org is null then
    raise exception 'This project does not exist' using errcode = 'P0002';
  end if;
  if not public.can_review_org(v_org) then
    raise exception 'Your role in this production cannot arrange the Wall' using errcode = '42501';
  end if;

  select array_agg(ids.id order by ids.position)
    into v_clean
    from unnest(coalesce(p_order, '{}'::uuid[])) with ordinality as ids (id, position)
   where exists (
     select 1
       from public.roles r
       join public.casting_calls c on c.id = r.casting_call_id
      where r.id = ids.id and c.project_id = p_project
   );

  update public.projects
     set wall_order = case when coalesce(cardinality(v_clean), 0) = 0 then null else v_clean end
   where id = p_project;
end;
$$;

revoke execute on function public.set_wall_selection(uuid, uuid) from public, anon;
revoke execute on function public.set_wall_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_wall_selection(uuid, uuid) to authenticated;
grant execute on function public.set_wall_order(uuid, uuid[]) to authenticated;
grant execute on function public.project_org_id(uuid) to authenticated;
-- Le nom n'est lu que par set_wall_selection() : pas d'accès direct.
revoke execute on function public.application_display_name(uuid) from public, anon, authenticated;

-- Le journal est la source du temps réel : chaque changement y écrit une
-- ligne, y compris un retrait (qu'une suppression dans wall_selections ne
-- permettrait pas de filtrer par projet).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'wall_selection_history'
     ) then
    alter publication supabase_realtime add table public.wall_selection_history;
  end if;
end $$;

-- ── Images tirées des self-tapes ─────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tape-stills', 'tape-stills', false, 3 * 1024 * 1024, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/** L'organisation qui a reçu une self-tape. */
create or replace function public.self_tape_org_id(p_self_tape uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.application_org_id(st.application_id)
    from public.self_tapes st
   where st.id = p_self_tape;
$$;

/**
 * Un objet du bucket `tape-stills` s'appelle `<org>/<self_tape>.jpg` : il est
 * accessible aux membres de l'organisation qui a reçu cette tape, et à eux
 * seuls. La comparaison se fait en texte — un nom mal formé ne lève pas
 * d'erreur de conversion, il est simplement refusé.
 */
create or replace function public.can_use_tape_still(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.self_tapes st
     where st.id::text = split_part(storage.filename(p_name), '.', 1)
       and public.self_tape_org_id(st.id)::text = (storage.foldername(p_name))[1]
       and public.is_org_member(public.self_tape_org_id(st.id))
  );
$$;

create policy "tape stills are readable by the receiving org"
  on storage.objects for select to authenticated
  using (bucket_id = 'tape-stills' and public.can_use_tape_still(name));

create policy "tape stills are writable by the receiving org"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tape-stills' and public.can_use_tape_still(name));

create policy "tape stills are replaceable by the receiving org"
  on storage.objects for update to authenticated
  using (bucket_id = 'tape-stills' and public.can_use_tape_still(name))
  with check (bucket_id = 'tape-stills' and public.can_use_tape_still(name));

create table public.tape_stills (
  self_tape_id  uuid primary key references public.self_tapes (id) on delete cascade,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  path          text not null,
  -- L'instant de la tape d'où vient l'image, et son format d'origine.
  at_s          numeric(8, 2),
  width         int,
  height        int,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint tape_stills_path check (path = org_id::text || '/' || self_tape_id::text || '.jpg')
);

alter table public.tape_stills enable row level security;

create policy tape_stills_read on public.tape_stills
  for select to authenticated
  using (public.is_org_member(org_id));

create policy tape_stills_insert on public.tape_stills
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and org_id = public.self_tape_org_id(self_tape_id)
    and public.is_org_member(org_id)
  );

revoke all on public.tape_stills from anon;
grant select, insert on public.tape_stills to authenticated;
grant execute on function public.self_tape_org_id(uuid) to authenticated;
grant execute on function public.can_use_tape_still(text) to authenticated;

-- ── Lecture : une ligne par rôle du projet ───────────────────────────────────

/**
 * Le mur d'un projet. `auditions` compte les candidatures envoyées (ni
 * brouillon ni retrait). `interesting` compte les candidats distincts qui ont
 * reçu au moins un Yes (`good`) ou un Maybe d'un membre de l'équipe pouvant
 * reviewer — un jugement humain, jamais un rang du feed d'intelligence. Une
 * candidature est unique par (rôle, talent), donc compter les candidatures
 * revient à compter les candidats.
 */
create view public.v_wall_roles with (security_invoker = true) as
select
  r.id                 as role_id,
  c.project_id,
  r.casting_call_id,
  c.title              as casting_title,
  c.created_at         as casting_created_at,
  r.name,
  r.description,
  r.role_type,
  r.role_group,
  r.sort_order,
  r.status             as role_status,
  r.created_at,
  coalesce(stats.auditions, 0)   as auditions,
  coalesce(stats.interesting, 0) as interesting,
  ws.application_id,
  ws.selected_by,
  ws.selected_at,
  sel.talent_id,
  sel.status           as application_status,
  case when ws.application_id is null then null
       else coalesce(nullif(stp.professional_name, ''),
                     nullif(trim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')), ''),
                     'Unnamed talent') end as actor_name,
  tape.self_tape_id,
  tape.duration_s
from public.roles r
join public.casting_calls c on c.id = r.casting_call_id
join public.projects p      on p.id = c.project_id
left join lateral (
  select
    count(*) as auditions,
    count(*) filter (
      where exists (
        select 1
          from public.candidate_reviews cr
          join public.organization_members m
            on m.profile_id = cr.reviewer_id
           and m.org_id = p.org_id
           and m.status = 'active'
           and m.role <> 'viewer'
         where cr.application_id = a.id
           and cr.vote in ('good', 'maybe')
      )
    ) as interesting
  from public.applications a
  where a.role_id = r.id
    and a.status not in ('draft', 'withdrawn')
) stats on true
left join public.wall_selections ws on ws.role_id = r.id
left join public.applications sel   on sel.id = ws.application_id
left join public.profiles sp        on sp.id = sel.talent_id
left join public.talent_profiles stp on stp.profile_id = sel.talent_id
left join lateral (
  select st.id as self_tape_id, st.duration_s
    from public.self_tapes st
   where st.application_id = ws.application_id
   order by st.submitted_at desc
   limit 1
) tape on true;

comment on view public.v_wall_roles is
  'The Wall™ : un rôle par ligne, ses compteurs et la sélection active.';

revoke all on public.v_wall_roles from anon;
grant select on public.v_wall_roles to authenticated;
