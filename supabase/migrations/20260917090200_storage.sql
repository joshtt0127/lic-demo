-- Let It Cast — Storage buckets & policies.
--
-- Path convention for every bucket: `<profile_id>/<uuid>.<ext>`, so ownership is
-- derivable from the object name and a talent can never write into someone
-- else's folder.
--
--   avatars    public   avatars + covers + organization logos (small images)
--   media      public   headshots, portfolio, showreels, project artwork
--   selftapes  private  audition tapes — read is granted only to the owner and
--                       to members of the organization that received the application

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',   'avatars',   true,  5  * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('media',     'media',     true,  200 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('selftapes', 'selftapes', false, 500 * 1024 * 1024,
   array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/** True when the object path is the caller's own folder. */
create or replace function public.storage_path_is_own(p_name text)
returns boolean
language sql
stable
as $$
  select nullif((storage.foldername(p_name))[1], '') = auth.uid()::text;
$$;

/**
 * A self-tape object is readable by its owner, or by a member of the
 * organization whose role the tape was submitted to.
 */
create or replace function public.can_read_selftape(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.storage_path_is_own(p_name)
     or exists (
       select 1
         from public.media_assets ma
         join public.self_tapes st on st.media_asset_id = ma.id
        where ma.bucket = p_bucket
          and ma.path = p_name
          and public.is_org_member(public.application_org_id(st.application_id))
     );
$$;

-- ── Public buckets: world-readable, owner-writable ───────────────────────────

create policy "avatars are readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "media is readable"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "own avatars are writable"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.storage_path_is_own(name));

create policy "own avatars are updatable"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.storage_path_is_own(name))
  with check (bucket_id = 'avatars' and public.storage_path_is_own(name));

create policy "own avatars are deletable"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_path_is_own(name));

create policy "own media is writable"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.storage_path_is_own(name));

create policy "own media is updatable"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.storage_path_is_own(name))
  with check (bucket_id = 'media' and public.storage_path_is_own(name));

create policy "own media is deletable"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.storage_path_is_own(name));

-- ── Private bucket: self-tapes ───────────────────────────────────────────────

create policy "selftapes are readable by owner or reviewing org"
  on storage.objects for select to authenticated
  using (bucket_id = 'selftapes' and public.can_read_selftape(bucket_id, name));

create policy "own selftapes are writable"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'selftapes' and public.storage_path_is_own(name));

create policy "own selftapes are updatable"
  on storage.objects for update to authenticated
  using (bucket_id = 'selftapes' and public.storage_path_is_own(name))
  with check (bucket_id = 'selftapes' and public.storage_path_is_own(name));

create policy "own selftapes are deletable"
  on storage.objects for delete to authenticated
  using (bucket_id = 'selftapes' and public.storage_path_is_own(name));
