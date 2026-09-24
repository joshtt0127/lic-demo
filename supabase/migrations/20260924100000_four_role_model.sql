-- Quatre rôles d'organisation : owner, admin, member, viewer.
--
-- La base en porte cinq depuis l'origine, mais trois d'entre eux étaient
-- indiscernables dans le code : `owner`, `admin` et `casting_director`
-- passaient tous par `can_manage_org()`. Cinq rôles à spécifier, trois rôles
-- réels, et une matrice de droits intestable : on ramène le modèle à ce qu'il
-- fait vraiment.
--
-- `casting_director` n'est **pas supprimé de l'enum** — retirer une valeur
-- d'enum est destructif et casserait toute ligne historique. Il est converti en
-- `admin` (aucune ligne concernée à ce jour, la conversion est là pour celles
-- qui pourraient apparaître entre cette migration et son déploiement), et il
-- disparaît des rôles proposés à l'écran.
--
-- Ce que cette migration ajoute vraiment : la distinction entre **administrer**
-- et **posséder**. Un admin gère l'équipe ; seul un owner transmet
-- l'organisation ou l'archive. `can_manage_org()` ne faisait pas la différence.

-- Les rôles existants, s'il y en a.
update public.organization_members
   set role = 'admin'
 where role = 'casting_director';

update public.organization_invites
   set role = 'admin'
 where role = 'casting_director'
   and accepted_at is null;

/**
 * Le propriétaire de l'organisation — la seule personne qui peut la transmettre.
 *
 * Distinct de `is_org_admin()` : un admin gère l'équipe au quotidien, il ne
 * décide pas de qui possède l'organisation.
 */
create or replace function public.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org) = 'owner';
$$;

revoke execute on function public.is_org_owner(uuid) from anon, public;
grant execute on function public.is_org_owner(uuid) to authenticated;

comment on function public.is_org_owner(uuid) is
  'Propriétaire de l''organisation : transmission et archivage. Un admin ne l''est pas.';
