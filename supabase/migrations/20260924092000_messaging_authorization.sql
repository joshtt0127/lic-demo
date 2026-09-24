-- P0-3 — On ne s'invite plus dans la conversation d'autrui, et on n'écrit plus
-- à n'importe qui.
--
-- Deux trous, le même symptôme : `conversation_members_insert` acceptait toute
-- ligne dont `profile_id = auth.uid()`.
--
--   · **Lire le courrier des autres** — vérifié : un comédien s'ajoute à une
--     conversation dont il n'est pas membre et lit les 2 messages échangés
--     entre une production et une autre comédienne.
--   · **Écrire à n'importe qui** — vérifié : ce même compte ouvre une
--     conversation avec un autre comédien, puis avec une production jamais
--     rencontrée. Message envoyé, notification reçue.
--
-- La règle produit retenue (§29 du cadrage), et ce qu'elle implique :
--
--   PRODUCTION → COMÉDIEN : autorisé. Contacter un comédien repéré dans
--     l'annuaire **est** le métier du casting, l'app a déjà un bouton dédié
--     avec ses amorces, et une organisation est une entité identifiée, pas un
--     compte anonyme. (Quand la vérification d'organisation arrivera, c'est ici
--     qu'elle se branchera : il suffira d'exiger `verified`.)
--
--   COMÉDIEN → PRODUCTION : seulement s'il a candidaté chez elle. Sans ce
--     lien, c'est de la sollicitation à froid.
--
--   COMÉDIEN → COMÉDIEN : jamais. C'est exactement le « DM social » que le
--     produit refuse, et le vecteur de harcèlement le plus direct.
--
--   SUIVRE ≠ POUVOIR ÉCRIRE. Le graphe social n'ouvre aucune messagerie.
--
-- Une conversation déjà ouverte continue de fonctionner pour ses membres : on
-- garde le fil, on ferme la porte d'entrée.

/** L'appelant a créé cette conversation (pour s'y ajouter lui-même, une fois). */
create or replace function public.is_conversation_creator(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation and c.created_by = auth.uid()
  );
$$;

/**
 * L'appelant a-t-il le droit d'ouvrir une conversation avec cette personne ?
 *
 * Volontairement lisible : une relation de casting, ou rien.
 */
create or replace function public.can_message(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_other is not null
    and p_other <> auth.uid()
    and (
      -- Je fais partie d'une organisation et j'écris à un comédien.
      (
        exists (
          select 1 from public.organization_members m
           where m.profile_id = auth.uid() and m.status = 'active'
        )
        and exists (
          select 1 from public.profiles p
           where p.id = p_other and p.account_type = 'talent'
        )
      )
      -- Ou : j'ai candidaté chez une organisation dont cette personne est membre.
      or exists (
        select 1
          from public.applications a
          join public.roles r on r.id = a.role_id
          join public.casting_calls cc on cc.id = r.casting_call_id
          join public.projects pr on pr.id = cc.project_id
          join public.organization_members m
            on m.org_id = pr.org_id and m.status = 'active'
         where a.talent_id = auth.uid() and m.profile_id = p_other
      )
      -- Ou : cette personne a candidaté chez une organisation dont je suis membre.
      or exists (
        select 1
          from public.applications a
          join public.roles r on r.id = a.role_id
          join public.casting_calls cc on cc.id = r.casting_call_id
          join public.projects pr on pr.id = cc.project_id
          join public.organization_members m
            on m.org_id = pr.org_id and m.status = 'active'
         where a.talent_id = p_other and m.profile_id = auth.uid()
      )
    );
$$;

revoke execute on function public.is_conversation_creator(uuid) from anon, public;
revoke execute on function public.can_message(uuid) from anon, public;
grant execute on function public.is_conversation_creator(uuid) to authenticated;
grant execute on function public.can_message(uuid) to authenticated;

drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert to authenticated
  with check (
    -- Je m'ajoute à une conversation que je viens de créer — et à aucune autre.
    (profile_id = auth.uid() and public.is_conversation_creator(conversation_id))
    -- Ou j'ajoute quelqu'un à un fil dont je suis déjà membre, si j'ai le droit
    -- de lui écrire.
    or (public.is_conversation_member(conversation_id) and public.can_message(profile_id))
  );
