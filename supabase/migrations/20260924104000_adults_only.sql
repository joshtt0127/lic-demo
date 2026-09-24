-- Le MVP est réservé aux majeurs.
--
-- Le casting concerne aussi des mineurs, et les faire entrer demande un
-- consentement parental, un compte tuteur et des règles de diffusion d'image
-- qu'on ne construit pas maintenant. Tant que ça n'existe pas, la plateforme
-- ne doit pas les accueillir en silence.
--
-- Ce qu'on stocke : **une confirmation, pas une date de naissance**. Savoir
-- « cette personne a déclaré être majeure, tel jour » suffit à la règle ; la
-- date de naissance exacte serait une donnée personnelle de plus à protéger,
-- à conserver et à supprimer, sans rien apporter au MVP.
--
-- La règle est appliquée là où elle compte — au moment de candidater, pas
-- seulement dans un formulaire. Un écran ne protège rien.
--
-- Comptes existants : ils sont considérés comme ayant confirmé. Les bloquer
-- rétroactivement couperait l'accès à des gens qui utilisent déjà le produit,
-- et une migration n'a pas à prendre cette décision toute seule. La règle vaut
-- pour les comptes créés à partir d'ici.

alter table public.profiles
  add column if not exists adult_confirmed_at timestamptz;

comment on column public.profiles.adult_confirmed_at is
  'Quand la personne a déclaré être majeure. Aucune date de naissance stockée.';

update public.profiles
   set adult_confirmed_at = coalesce(adult_confirmed_at, created_at)
 where adult_confirmed_at is null;

/**
 * On ne candidate pas sans avoir confirmé sa majorité.
 *
 * Le service role passe (fixtures, reprises, opérations) : `auth.uid()` est nul.
 */
create or replace function public.guard_application_adult()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.talent_id <> auth.uid() then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = new.talent_id and p.adult_confirmed_at is not null
  ) then
    raise exception 'Let It Cast is open to adults only for now'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_application_adult() from anon, authenticated, public;

drop trigger if exists applications_guard_adult on public.applications;
create trigger applications_guard_adult
  before insert on public.applications
  for each row execute function public.guard_application_adult();
