-- Consentement, export, effacement.
--
-- Trois droits qu'on ne peut pas ajouter après coup sans mentir : savoir ce
-- qu'on a accepté, récupérer ses données, et partir.
--
-- **Le consentement se date et se versionne.** « La personne a accepté » ne veut
-- rien dire sans savoir *quoi* et *quand* : les conditions changent, et un
-- consentement donné sur une version de texte ne vaut pas pour la suivante. On
-- stocke donc le type, la version, l'instant et d'où il vient.
--
-- **L'export rend ce qu'on a, pas ce qu'on croit avoir.** Il est construit à
-- partir des tables réelles, en une fonction, pour qu'il ne puisse pas dériver
-- de ce que la base contient vraiment.
--
-- **L'effacement ne détruit pas l'histoire des autres.** Une candidature, une
-- décision de casting, un fait daté : ce sont aussi les données d'une
-- production, et les faire disparaître réécrirait son passé. Le profil est donc
-- anonymisé — nom, ville, photo, données sensibles, coordonnées d'agent — et
-- les faits restent, rattachés à un compte désormais sans nom.
--
-- Ce que cette migration **ne fait pas** : supprimer le compte d'authentification
-- lui-même. Ça demande la clé de service, donc une opération LIC tracée. La
-- demande est enregistrée et visible dans la console d'exploitation ; c'est un
-- humain qui la termine, et c'est volontaire.

create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  /** terms · privacy · sensitive_data — ce à quoi on consent. */
  kind       text not null,
  /** La version du texte accepté. Sans elle, le consentement n'est pas opposable. */
  version    text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source     text not null default 'app',
  unique (profile_id, kind, version)
);

comment on table public.consents is
  'Ce que la personne a accepté, dans quelle version, et quand.';

alter table public.consents enable row level security;

drop policy if exists consents_own on public.consents;
create policy consents_own on public.consents
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists consents_support on public.consents;
create policy consents_support on public.consents
  for select to authenticated
  using (public.is_lic_support());

create table if not exists public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  reason       text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  unique (profile_id)
);

comment on table public.deletion_requests is
  'Une demande d''effacement. Le profil est anonymisé tout de suite ; la suppression du compte est une opération LIC.';

alter table public.deletion_requests enable row level security;

drop policy if exists deletion_requests_own on public.deletion_requests;
create policy deletion_requests_own on public.deletion_requests
  for select to authenticated
  using (profile_id = auth.uid() or public.is_lic_support());

-- ── Récupérer ses données ─────────────────────────────────────────────────

/**
 * Tout ce que la plateforme détient sur la personne connectée.
 *
 * Volontairement construit table par table : un export qui se contenterait du
 * profil laisserait croire que c'est tout ce qu'on garde.
 */
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'talent_profile', (
      select to_jsonb(t) from public.talent_profiles t where t.profile_id = auth.uid()
    ),
    'consents', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.granted_at)
        from public.consents c where c.profile_id = auth.uid()
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
        from public.applications a where a.talent_id = auth.uid()
    ), '[]'::jsonb),
    'self_tapes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'application_id', st.application_id,
               'submitted_at', st.submitted_at, 'duration_s', st.duration_s,
               'file', jsonb_build_object('bucket', m.bucket, 'path', m.path, 'bytes', m.bytes)
             ) order by st.submitted_at)
        from public.self_tapes st
        join public.applications a on a.id = st.application_id
        left join public.media_assets m on m.id = st.media_asset_id
       where a.talent_id = auth.uid()
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
        from public.media_assets m where m.owner_id = auth.uid()
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.created_at)
        from public.posts po where po.author_id = auth.uid()
    ), '[]'::jsonb),
    'messages_sent', coalesce((
      select jsonb_agg(jsonb_build_object('id', ms.id, 'body', ms.body, 'created_at', ms.created_at)
             order by ms.created_at)
        from public.messages ms where ms.sender_id = auth.uid()
    ), '[]'::jsonb),
    'events_about_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.type, 'occurred_at', e.occurred_at,
               'before', e.before, 'after', e.after
             ) order by e.occurred_at)
        from public.events e where e.subject_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.export_my_data() from anon, public;
grant execute on function public.export_my_data() to authenticated;

-- ── Partir ────────────────────────────────────────────────────────────────

/**
 * Anonymise le profil, enregistre la demande, et laisse l'histoire intacte.
 *
 * Ce qui disparaît : le nom, la ville, la photo, l'accroche, la biographie, les
 * données sensibles, les coordonnées de l'agent, les publications.
 * Ce qui reste : les candidatures, les décisions, les faits — ce sont aussi les
 * données d'une production, et les effacer réécrirait son passé.
 *
 * Les fichiers du stockage sont supprimés par le client **avant** cet appel :
 * les policies l'y autorisent pour ses propres fichiers, et une suppression de
 * ligne SQL ne retirerait pas l'objet du stockage.
 */
create or replace function public.request_account_deletion(p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  insert into public.deletion_requests (profile_id, reason)
  values (v_me, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (profile_id) do nothing;

  update public.talent_profiles
     set professional_name = null, headline = null, bio = null, cover_url = null,
         gender = null, ethnicities = '{}', nationalities = '{}', accents = '{}',
         height_cm = null, union_name = null, website = null,
         agency_name = null, agent_name = null, agent_email = null, agent_phone = null
   where profile_id = v_me;

  delete from public.posts where author_id = v_me;
  delete from public.follows where follower_id = v_me or following_id = v_me;
  delete from public.media_assets where owner_id = v_me;

  update public.profiles
     set first_name = 'Deleted', last_name = 'account', avatar_url = null,
         city = null, country = null, email_notifications = false,
         suspended_at = now(), suspended_reason = 'account deleted by its owner'
   where id = v_me;

  insert into public.events (type, actor_id, entity_type, entity_id, subject_id, source)
  values ('ACCOUNT_DELETION_REQUESTED', v_me, 'profile', v_me, v_me, 'app');
end;
$$;

revoke execute on function public.request_account_deletion(text) from anon, public;
grant execute on function public.request_account_deletion(text) to authenticated;

comment on function public.request_account_deletion(text) is
  'Anonymise le profil et enregistre la demande. La suppression du compte d''authentification reste une opération LIC.';
