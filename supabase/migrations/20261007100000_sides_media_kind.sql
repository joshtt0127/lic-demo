-- Audition Sides™ — 1/2 : le type de média « sides » (le PDF des scènes d'un rôle).
--
-- Migration séparée : PostgreSQL refuse d'utiliser une valeur d'énumération
-- dans la transaction qui la crée (même règle que 20261004120000).

alter type public.media_kind add value if not exists 'sides';
