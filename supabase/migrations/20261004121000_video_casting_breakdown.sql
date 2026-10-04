-- Brief Once. Launch Everywhere™ — 2/2 : le Video Casting Breakdown™.
--
-- Deux objets, et rien de plus :
--
--   · `brief_videos` — UNE vidéo par cible : le Project Brief Video™
--     (`role_id is null`) ou un Role Brief Video™. Remplacer une vidéo met à
--     jour la ligne : le breakdown reste une source vivante, pas une pile de
--     versions.
--   · `brief_extractions` — ce que l'IA a compris d'une vidéo : transcription
--     minutée + champs proposés, chacun marqué detected / suggested / missing.
--     Un BROUILLON : rien n'en sort vers `projects` ou `roles` sans que la
--     production l'ait validé dans l'interface (« Draft first. Never blind
--     save. »). L'extraction appartient à l'organisation, pas au projet : on
--     peut briefer AVANT que le projet existe — c'est tout l'intérêt.
--
-- Visibilité (« Shareable does not mean automatically public ») :
--   internal    l'équipe de production seulement ;
--   applicants  + les comptes qui peuvent lire l'annonce (et ceux qui ont
--               candidaté, même après fermeture) ;
--   public      + les visiteurs non connectés de la page publique.
-- La règle est en base. Le fichier vit dans le bucket public `media` sous un
-- chemin imprévisible : c'est la LIGNE qui donne l'URL, et la ligne suit la
-- visibilité.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'brief_visibility') then
    create type public.brief_visibility as enum ('internal', 'applicants', 'public');
  end if;
end $$;

create table if not exists public.brief_videos (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  role_id        uuid references public.roles (id) on delete cascade,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  url            text not null,
  duration_s     numeric(8, 2),
  visibility     public.brief_visibility not null default 'applicants',
  recorded_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.brief_videos is
  'Video Casting Breakdown™ : Project Brief Video™ (role_id null) et Role Brief Videos™.';

-- Une seule vidéo par cible.
create unique index if not exists brief_videos_one_per_target
  on public.brief_videos (project_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists brief_videos_updated_at on public.brief_videos;
create trigger brief_videos_updated_at before update on public.brief_videos
  for each row execute function public.set_updated_at();

/** Le rôle d'un Role Brief Video™ appartient bien au projet indiqué. */
create or replace function public.guard_brief_video_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is not null and not exists (
    select 1
      from public.roles r
      join public.casting_calls c on c.id = r.casting_call_id
     where r.id = new.role_id and c.project_id = new.project_id
  ) then
    raise exception 'This role does not belong to this project' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists brief_videos_guard_role on public.brief_videos;
create trigger brief_videos_guard_role before insert or update on public.brief_videos
  for each row execute function public.guard_brief_video_role();

/**
 * Le brief est-il lisible par ce compte (hors équipe) ? Brief de rôle : son
 * annonce ; brief de projet : l'une des annonces du projet.
 */
create or replace function public.brief_reachable(p_project uuid, p_role uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_role is not null then exists (
      select 1 from public.roles r
       where r.id = p_role
         and (public.casting_is_openly_readable(r.casting_call_id)
              or (auth.uid() is not null and public.talent_applied_to_casting(r.casting_call_id)))
    )
    else exists (
      select 1 from public.casting_calls c
       where c.project_id = p_project
         and (public.casting_is_openly_readable(c.id)
              or (auth.uid() is not null and public.talent_applied_to_casting(c.id)))
    )
  end;
$$;

revoke execute on function public.brief_reachable(uuid, uuid) from public;
grant execute on function public.brief_reachable(uuid, uuid) to anon, authenticated;

alter table public.brief_videos enable row level security;

drop policy if exists brief_videos_read on public.brief_videos;
create policy brief_videos_read on public.brief_videos
  for select to authenticated
  using (
    public.is_org_member(public.project_org_id(project_id))
    or (visibility in ('applicants', 'public') and public.brief_reachable(project_id, role_id))
  );

drop policy if exists brief_videos_read_anon on public.brief_videos;
create policy brief_videos_read_anon on public.brief_videos
  for select to anon
  using (visibility = 'public' and public.brief_reachable(project_id, role_id));

drop policy if exists brief_videos_write on public.brief_videos;
create policy brief_videos_write on public.brief_videos
  for all to authenticated
  using (public.can_manage_org(public.project_org_id(project_id)))
  with check (public.can_manage_org(public.project_org_id(project_id)));

-- ── Extractions ─────────────────────────────────────────────────────────────

create table if not exists public.brief_extractions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  target         text not null check (target in ('project', 'role')),
  video_url      text not null,
  brief_video_id uuid references public.brief_videos (id) on delete set null,
  status         text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  -- [{ "start": 12.4, "end": 15.0, "text": "…" }]
  transcript     jsonb,
  -- [{ "field", "status": detected|suggested|missing, "value", "values", "start", "quote" }]
  fields         jsonb,
  language       text,
  model          text,
  error          text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists brief_extractions_org_idx on public.brief_extractions (org_id, created_at desc);

alter table public.brief_extractions enable row level security;

-- Lire : l'équipe. Créer : qui peut gérer l'organisation. Le RÉSULTAT n'est
-- écrit que par la fonction `extract-brief` (clé service role) : un navigateur
-- ne peut pas fabriquer une « détection ».
drop policy if exists brief_extractions_read on public.brief_extractions;
create policy brief_extractions_read on public.brief_extractions
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists brief_extractions_insert on public.brief_extractions;
create policy brief_extractions_insert on public.brief_extractions
  for insert to authenticated
  with check (
    public.can_manage_org(org_id)
    and status = 'pending'
    and transcript is null
    and fields is null
  );

-- Rattacher le brouillon à la vidéo enregistrée ensuite (rien d'autre).
drop policy if exists brief_extractions_link on public.brief_extractions;
create policy brief_extractions_link on public.brief_extractions
  for update to authenticated
  using (public.can_manage_org(org_id))
  with check (public.can_manage_org(org_id));

create or replace function public.guard_brief_extraction_update()
returns trigger
language plpgsql
as $$
begin
  -- La clé service role (fonction) passe ; un compte ne change que le lien.
  if auth.role() = 'service_role' then
    return new;
  end if;
  if (new.status, new.transcript, new.fields, new.video_url, new.target, new.org_id, new.error, new.model)
     is distinct from
     (old.status, old.transcript, old.fields, old.video_url, old.target, old.org_id, old.error, old.model) then
    raise exception 'Only the extraction service writes results' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists brief_extractions_guard on public.brief_extractions;
create trigger brief_extractions_guard before update on public.brief_extractions
  for each row execute function public.guard_brief_extraction_update();
