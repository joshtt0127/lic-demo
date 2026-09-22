-- Un directeur de casting ne rend pas une note : il rend un avis et une suite.
--
-- Deux colonnes de plus sur l'avis IA :
--   · `recommendation` — ce qu'il ferait de ce comédien (callback / maybe /
--     pass), parce qu'une note sans décision n'aide personne à caster ;
--   · `direction` — ce qu'il lui demanderait de changer pour une seconde prise,
--     qui est exactement ce qu'un directeur de casting dit en salle.

alter table public.tape_ai_reviews
  add column if not exists recommendation text,
  add column if not exists direction text;

comment on column public.tape_ai_reviews.recommendation is
  'callback | maybe | pass — la suite proposée, jamais une décision automatique.';
comment on column public.tape_ai_reviews.direction is
  'Ce qu''un directeur de casting demanderait pour une seconde prise.';
