-- P0-2 — Le type de compte n'est plus modifiable par son titulaire.
--
-- `profiles_update_self` autorise l'UPDATE de sa propre ligne sans restriction
-- de colonne. L'audit l'a vérifié deux fois : un comédien passait son
-- `account_type` à `production` et la valeur était persistée. Or le type de
-- compte est la racine du modèle de droits — les gardes de route, la surface
-- affichée et la capacité à créer une organisation en dépendent.
--
-- On ne restreint pas la policy (une policy ne sait pas dire « toutes les
-- colonnes sauf une ») : on pose un garde-fou ligne à ligne, qui laisse
-- l'onboarding faire son travail et refuse tout changement ultérieur.
--
-- La clé service role (`auth.uid()` nul) n'est pas concernée : c'est par elle
-- que passeront les corrections d'exploitation, tracées côté Admin.

create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pas d'appelant authentifié : service role, migration, trigger interne.
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile cannot change identity' using errcode = '42501';
  end if;

  -- `null → talent|production` est l'onboarding : c'est le seul passage permis.
  if old.account_type is not null and new.account_type is distinct from old.account_type then
    raise exception 'Your account type is chosen during onboarding and cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_profile_identity() from anon, authenticated, public;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function public.guard_profile_identity();
