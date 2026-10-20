-- The Wall™ — les petits rôles.
--
-- Un plateau se lit par importance : premiers rôles, seconds rôles, petits
-- rôles. `lead` et `supporting` existaient ; il manquait le troisième rang.
-- Fichier à part : une valeur d'enum ajoutée ne peut pas servir dans la même
-- transaction, et la migration suivante n'y fait référence qu'en texte.

alter type public.role_type add value if not exists 'small' after 'supporting';
