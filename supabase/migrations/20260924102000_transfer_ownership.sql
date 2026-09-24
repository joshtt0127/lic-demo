-- Transmettre une organisation, et pouvoir la quitter.
--
-- Depuis la Phase 1, un owner ne peut plus partir sans avoir transmis : le
-- trigger refuse la suppression du dernier propriétaire actif. C'était la bonne
-- règle, mais elle enfermait tout le monde — **aucun parcours ne permettait de
-- transmettre**. Une personne qui quitte la société restait propriétaire de
-- l'organisation pour toujours.
--
-- La transmission est une opération, pas deux écritures : si elle se faisait en
-- deux requêtes (promouvoir l'un, rétrograder l'autre), une coupure au milieu
-- laisserait deux propriétaires — ou zéro. D'où la fonction.
--
-- L'ancien propriétaire devient `admin` : il garde son travail en cours, il
-- perd seulement la propriété. Le faire disparaître de l'équipe serait une
-- surprise désagréable, et ce n'est pas ce qu'on demande quand on transmet.

create or replace function public.transfer_organization_ownership(p_org uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if public.org_role_of(p_org) is distinct from 'owner' then
    raise exception 'Only the owner can hand over this organization' using errcode = '42501';
  end if;
  if p_to = v_actor then
    raise exception 'You already own this organization' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_members m
     where m.org_id = p_org and m.profile_id = p_to and m.status = 'active'
  ) then
    raise exception 'That person is not an active member of this organization'
      using errcode = '22023';
  end if;

  -- Le trigger de garde autorise ces deux écritures : elles sont faites par un
  -- owner. L'ordre compte — on promeut avant de rétrograder, pour qu'il y ait à
  -- tout instant au moins un propriétaire.
  update public.organization_members
     set role = 'owner'
   where org_id = p_org and profile_id = p_to;

  update public.organization_members
     set role = 'admin'
   where org_id = p_org and profile_id = v_actor;
end;
$$;

revoke execute on function public.transfer_organization_ownership(uuid, uuid) from anon, public;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;

comment on function public.transfer_organization_ownership(uuid, uuid) is
  'Transmet la propriété en une opération. L''ancien propriétaire reste dans l''équipe, en admin.';
