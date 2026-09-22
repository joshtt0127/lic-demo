-- Les publications — la partie « réseau social » du fil.
--
-- Jusqu'ici le fil ne contenait que des castings publiés par des productions.
-- Ce qui manquait pour que ce soit un réseau : que les gens y publient, et que
-- l'on voie ce que publient **les gens que l'on suit**. C'est la logique
-- Instagram / TikTok, appliquée au métier : une bande démo, une photo de
-- tournage, un mot après une audition.
--
-- Ce qui n'est PAS publié ici : les candidatures. Ce qu'un comédien envoie à une
-- production reste privé (RLS sur `applications`) ; un fil d'activité qui
-- dirait « X a postulé chez Y » trahirait exactement ce que la plateforme
-- promet de garder entre eux.

create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body           text not null,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint posts_body_not_empty check (length(btrim(body)) > 0),
  constraint posts_body_length check (length(body) <= 2000)
);

create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_recent_idx on public.posts (created_at desc);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.posts      enable row level security;
alter table public.post_likes enable row level security;

-- Une publication est publique entre comptes connectés : c'est ce qui permet de
-- découvrir quelqu'un avant de le suivre.
create policy posts_read on public.posts
  for select to authenticated using (true);

create policy posts_write on public.posts
  for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy post_likes_read on public.post_likes
  for select to authenticated using (true);

create policy post_likes_write on public.post_likes
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ── Notification ─────────────────────────────────────────────────────────────
-- Être aimé par quelqu'un est le signal social de base ; on ne se notifie pas
-- soi-même.

create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name   text;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is null or v_author = new.profile_id then
    return new;
  end if;

  select coalesce(nullif(tp.professional_name, ''),
                  nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                  'Someone')
    into v_name
    from public.profiles p
    left join public.talent_profiles tp on tp.profile_id = p.id
   where p.id = new.profile_id;

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  values (v_author, 'post_like', 'New like', v_name || ' liked your post', 'post', new.post_id);

  return new;
end;
$$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify
  after insert on public.post_likes
  for each row execute function public.notify_post_like();
