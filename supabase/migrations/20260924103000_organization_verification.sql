-- Une organisation non vérifiée ne publie pas de casting public.
--
-- C'est la seule barrière qui protège un comédien d'un faux casting : il confie
-- son image et son jeu à une société qu'il ne connaît pas. Aujourd'hui,
-- n'importe qui crée une organisation nommée « A24 » et publie.
--
-- Ce que la règle ne bloque pas, volontairement : créer son organisation,
-- compléter son profil, préparer ses projets, ses castings et ses rôles. Tout
-- le travail de préparation reste possible — c'est le moment de la **mise en
-- ligne publique** qui demande d'avoir été vérifié.
--
-- Trois états, et rien de plus : `unverified` (par défaut), `verified`,
-- `suspended`. Une organisation suspendue ne publie plus, même vérifiée.
--
-- La règle est **configurable** : `platform_setting('require_verified_org')`
-- lit le même coffre que les réglages e-mail. Absente, elle vaut « oui » — le
-- défaut sûr. LIC pourra l'assouplir sans redéployer.
--
-- Reprise des données : les organisations qui ont **déjà** un casting public en
-- ligne sont marquées `verified`. Les bloquer rétroactivement casserait des
-- castings en cours, ce qui n'est pas une décision de migration.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_verification') then
    create type public.org_verification as enum ('unverified', 'verified', 'suspended');
  end if;
end $$;

alter table public.organizations
  add column if not exists verification_status public.org_verification not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists suspended_reason text;

comment on column public.organizations.verification_status is
  'unverified (défaut) · verified (peut publier) · suspended (ne publie plus).';

-- Les organisations déjà en ligne restent en ligne.
update public.organizations o
   set verification_status = 'verified',
       verified_at = coalesce(o.verified_at, now())
 where o.verification_status = 'unverified'
   and exists (
     select 1
       from public.casting_calls c
       join public.projects p on p.id = c.project_id
      where p.org_id = o.id
        and c.status = 'published'
   );

/** Un réglage de plateforme, lu dans le coffre — comme les réglages e-mail. */
create or replace function public.platform_setting(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select nullif(trim(decrypted_secret), '')
    from vault.decrypted_secrets
   where name = p_name
   limit 1;
$$;

revoke all on function public.platform_setting(text) from public, anon, authenticated;

/** L'organisation a-t-elle le droit de mettre un casting public en ligne ? */
create or replace function public.org_may_publish(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select verification_status from public.organizations where id = p_org) = 'suspended'
      then false
    when coalesce(public.platform_setting('require_verified_org'), 'true') <> 'true'
      then true
    else (select verification_status from public.organizations where id = p_org) = 'verified'
  end;
$$;

revoke execute on function public.org_may_publish(uuid) from anon, public;
grant execute on function public.org_may_publish(uuid) to authenticated;

/**
 * Le garde-fou, au moment de la publication.
 *
 * Il ne regarde que la transition vers `published` : un casting déjà en ligne
 * quand l'organisation est suspendue n'est pas retiré par ce trigger — retirer
 * un casting est une décision de modération, pas un effet de bord.
 */
create or replace function public.guard_casting_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status is distinct from 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;
  if new.visibility is distinct from 'public' then
    return new;
  end if;

  select p.org_id into v_org from public.projects p where p.id = new.project_id;

  if not public.org_may_publish(v_org) then
    raise exception 'This organization must be verified before publishing a public casting'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_casting_publication() from anon, authenticated, public;

drop trigger if exists casting_calls_guard_publication on public.casting_calls;
create trigger casting_calls_guard_publication
  before insert or update on public.casting_calls
  for each row execute function public.guard_casting_publication();
