-- Correctif : l'effacement d'un compte doit pouvoir le suspendre.
--
-- `request_account_deletion()` pose `suspended_at` pour qu'un compte parti ne
-- puisse plus agir. Mais le garde de la Phase 7 refuse toute écriture de cette
-- colonne hors d'un administrateur LIC — et il a raison : se dé-suspendre
-- soi-même viderait la suspension de son sens.
--
-- Plutôt que d'affaiblir le garde, la fonction d'effacement **s'annonce** : elle
-- pose un drapeau local à la transaction, que le garde reconnaît. La règle
-- générale ne bouge pas d'un pouce ; c'est une porte nommée, pas une brèche.

create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile cannot change identity' using errcode = '42501';
  end if;

  if old.account_type is not null and new.account_type is distinct from old.account_type then
    raise exception 'Your account type is chosen during onboarding and cannot be changed'
      using errcode = '42501';
  end if;

  if new.platform_role is distinct from old.platform_role then
    raise exception 'Platform roles are granted outside the app' using errcode = '42501';
  end if;

  if new.suspended_at is distinct from old.suspended_at
     and not public.is_lic_admin()
     -- La seule exception, et elle est nommée : quelqu'un qui efface son compte.
     and coalesce(current_setting('lic.deleting_account', true), '') <> 'on' then
    raise exception 'Only Let It Cast can lift a suspension' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_profile_identity() from anon, authenticated, public;

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

  -- Local à la transaction : le drapeau retombe avec elle.
  perform set_config('lic.deleting_account', 'on', true);

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
