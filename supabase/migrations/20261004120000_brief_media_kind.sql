-- Brief Once. Launch Everywhere™ — 1/2 : le type de média « brief ».
--
-- Migration séparée : PostgreSQL refuse d'utiliser une valeur d'énumération
-- dans la transaction qui la crée (même règle que 20260924113000).

alter type public.media_kind add value if not exists 'brief';
