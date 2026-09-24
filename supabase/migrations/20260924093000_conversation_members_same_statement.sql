-- Correctif de la policy précédente : ouvrir un fil en une seule requête.
--
-- `startConversation` insère les deux participants d'un coup :
--
--   insert into conversation_members values (conv, moi), (conv, l'autre)
--
-- La policy exigeait, pour la seconde ligne, d'être **déjà membre** du fil. Or
-- dans une même instruction, la première ligne n'est pas encore visible aux
-- sous-requêtes de la policy : la condition est fausse, et l'insertion entière
-- est refusée. Le test E2E « une production écrit à un comédien » l'a attrapé.
--
-- On ajoute donc la branche qui manquait : **le créateur du fil** peut y ajouter
-- quelqu'un qu'il a le droit de contacter, sans avoir à prouver qu'il est déjà
-- membre de sa propre conversation. L'autorisation de fond ne bouge pas : c'est
-- toujours `can_message()` qui décide qui peut être ajouté.

drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert to authenticated
  with check (
    -- Je m'ajoute à une conversation que je viens de créer — et à aucune autre.
    (profile_id = auth.uid() and public.is_conversation_creator(conversation_id))
    -- J'ouvre le fil et j'y mets la personne que j'ai le droit de contacter.
    or (public.is_conversation_creator(conversation_id) and public.can_message(profile_id))
    -- Ou j'ajoute quelqu'un à un fil dont je suis déjà membre.
    or (public.is_conversation_member(conversation_id) and public.can_message(profile_id))
  );
