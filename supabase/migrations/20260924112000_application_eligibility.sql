-- Candidater : une fois par rôle, et avec de quoi être jugé.
--
-- Deux règles qui manquaient, et qui abîment le produit chacune à sa façon.
--
-- (L'unicité par rôle existait déjà — `applications_role_id_talent_id_key`. Je
-- l'avais manquée et j'ai d'abord ajouté un index concurrent, retiré aussitôt
-- par la migration suivante : voir le commentaire qui y explique la décision
-- produit restée ouverte.)
--
-- **Un profil qui permet de juger.** Une production qui reçoit un nom vide,
-- sans photo, sans âge de jeu et sans ville ne peut rien en faire — et le
-- comédien, lui, croit avoir postulé. Quatre informations, pas une de plus :
-- son nom, une photo, son âge de jeu, sa ville. Le reste du profil enrichit,
-- il ne conditionne pas.

-- ── De quoi être jugé ─────────────────────────────────────────────────────

/**
 * Le minimum pour candidater, et la liste de ce qui manque.
 *
 * Renvoie un tableau vide quand tout y est — le client s'en sert pour dire
 * précisément quoi compléter, plutôt que d'afficher un bouton mort.
 */
create or replace function public.missing_for_application(p_talent uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(missing order by missing), '{}')
    from (
      select 'name' as missing
       where not exists (
         select 1 from public.profiles p
          left join public.talent_profiles t on t.profile_id = p.id
          where p.id = p_talent
            and (
              coalesce(nullif(trim(t.professional_name), ''), '') <> ''
              or (coalesce(nullif(trim(p.first_name), ''), '') <> ''
                  and coalesce(nullif(trim(p.last_name), ''), '') <> '')
            )
       )
      union all
      select 'photo'
       where not exists (
         select 1 from public.profiles p where p.id = p_talent and p.avatar_url is not null
       )
       and not exists (
         select 1 from public.media_assets m
          where m.owner_id = p_talent and m.kind in ('headshot', 'portfolio')
       )
      union all
      select 'playingAge'
       where not exists (
         select 1 from public.talent_profiles t
          where t.profile_id = p_talent
            and t.playing_age_min is not null
            and t.playing_age_max is not null
       )
      union all
      select 'location'
       where not exists (
         select 1 from public.profiles p
          where p.id = p_talent and coalesce(nullif(trim(p.city), ''), '') <> ''
       )
    ) as gaps;
$$;

revoke execute on function public.missing_for_application(uuid) from anon, public;
grant execute on function public.missing_for_application(uuid) to authenticated;

create or replace function public.guard_application_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing text[];
begin
  -- Service role : fixtures, reprises, opérations.
  if auth.uid() is null or new.talent_id <> auth.uid() then
    return new;
  end if;

  v_missing := public.missing_for_application(new.talent_id);
  if array_length(v_missing, 1) is not null then
    raise exception 'Your profile needs % before you can apply', array_to_string(v_missing, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_application_eligibility() from anon, authenticated, public;

drop trigger if exists applications_guard_eligibility on public.applications;
create trigger applications_guard_eligibility
  before insert on public.applications
  for each row execute function public.guard_application_eligibility();
