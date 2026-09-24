-- L'invitation par jeton — celle que l'e-mail envoie déjà.
--
-- L'e-mail d'invitation et le bouton « copier le lien » produisent tous deux
-- une URL contenant le jeton. Personne ne la consomme : l'acceptation ne
-- fonctionne aujourd'hui que par correspondance d'adresse, depuis l'onboarding
-- production. Le lien tombe donc sur une page d'inscription qui ignore le
-- jeton, et l'invité doit deviner qu'il faut créer un compte avec la bonne
-- adresse pour voir apparaître son invitation.
--
-- Cette fonction ferme la boucle en une opération atomique : elle valide le
-- jeton, crée l'appartenance au rôle prévu **par l'invitation**, et marque
-- celle-ci comme acceptée.
--
-- Ce qu'elle ne lâche pas : l'adresse doit correspondre. Un jeton qui circule
-- (capture d'écran, e-mail transféré, lien recopié) ne doit pas suffire à
-- entrer dans une organisation — il faut aussi contrôler la boîte à laquelle
-- l'invitation a été adressée. C'est la même exigence que celle posée en
-- Phase 1, par un autre chemin.

create or replace function public.accept_organization_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.organization_invites;
  v_email text := lower(coalesce(auth.email(), ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept an invitation' using errcode = '42501';
  end if;

  select * into v_invite
    from public.organization_invites
   where token = p_token
   limit 1;

  if v_invite.id is null then
    raise exception 'This invitation link is not valid' using errcode = '22023';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invitation has already been used' using errcode = '22023';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'This invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invite.email) is distinct from v_email then
    raise exception 'This invitation was sent to another address' using errcode = '42501';
  end if;

  -- Déjà membre : on ne duplique pas, on consomme l'invitation et on renvoie
  -- l'organisation. Cliquer deux fois sur un lien ne doit rien casser.
  if exists (
    select 1 from public.organization_members m
     where m.org_id = v_invite.org_id and m.profile_id = auth.uid()
  ) then
    update public.organization_invites set accepted_at = now() where id = v_invite.id;
    return v_invite.org_id;
  end if;

  insert into public.organization_members (org_id, profile_id, role, status)
  values (v_invite.org_id, auth.uid(), v_invite.role, 'active');

  update public.organization_invites set accepted_at = now() where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

revoke execute on function public.accept_organization_invite(text) from anon, public;
grant execute on function public.accept_organization_invite(text) to authenticated;

comment on function public.accept_organization_invite(text) is
  'Honore un lien d''invitation : jeton valide + adresse correspondante = appartenance au rôle invité.';

-- Et le lien de l'e-mail pointe désormais vers la page qui le traite, au lieu
-- d'une inscription qui ignorait le jeton.
create or replace function public.enqueue_invite_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    text;
  v_who    text;
  v_base   text;
begin
  select o.name into v_org from public.organizations o where o.id = new.org_id;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into v_who
    from public.profiles p
   where p.id = new.invited_by;

  v_base := coalesce(public.email_setting('app_base_url'), 'http://localhost:5180');

  insert into public.email_outbox (to_email, subject, html, kind, invite_id)
  values (
    new.email,
    coalesce(nullif(v_who, ''), 'A casting team') || ' invited you to ' || coalesce(v_org, 'their team'),
    public.email_html(
      'You are invited to ' || coalesce(v_org, 'a casting team'),
      coalesce(nullif(v_who, ''), 'A casting team') ||
        ' invited you to join them on Let It Cast as ' || new.role || '.',
      'Accept the invitation',
      v_base || '/invite/' || new.token
    ),
    'team_invite',
    new.id
  );

  return new;
end;
$$;

revoke execute on function public.enqueue_invite_email() from anon, authenticated, public;
