-- Durcissement, après l'alerte « critical » de Supabase.
--
-- Ce qui était vraiment ouvert, vérifié avec la seule clé publique et sans être
-- connecté :
--
--   anon → public.schema_migrations : LISIBLE, 5 lignes
--   {"name":"20260917090000_init.sql","applied_at":"2026-09-17T18:47:40Z"}
--
-- L'historique des migrations n'a rien à faire dans l'API : c'est la carte du
-- schéma offerte à qui passe. Il part dans un schéma non exposé.
--
-- Et tant qu'à ouvrir le capot, les trois autres familles remontées par
-- l'advisor sont traitées ici aussi.

-- ── 1. L'historique des migrations quitte l'API ──────────────────────────────
-- Le déménagement lui-même est fait par le bootstrap de `scripts/db.mjs`, qui
-- emporte les lignes existantes : le faire ici reviendrait à déplacer la table
-- dans la transaction qui écrit dedans.

-- ── 2. Les fonctions internes ne sont plus appelables par un anonyme ─────────
-- Les policies sont toutes `to authenticated` : un visiteur non connecté n'a
-- jamais besoin d'évaluer ces fonctions. `authenticated` les garde, sinon
-- l'évaluation des policies échouerait (elles s'exécutent avec les droits de
-- l'appelant).

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format('revoke execute on function %s from anon, public', fn.signature);
  end loop;
end
$$;

-- ── 3. Un `search_path` figé sur les fonctions qui n'en avaient pas ──────────
-- Sans lui, un schéma placé devant `public` dans le search_path de l'appelant
-- peut détourner un appel de fonction — d'autant plus gênant sur une fonction
-- `security definer`.

alter function public.set_updated_at()                      set search_path = public;
alter function public.touch_conversation()                  set search_path = public;
alter function public.can_manage_org(uuid)                  set search_path = public;
alter function public.is_org_admin(uuid)                    set search_path = public;
alter function public.can_review_org(uuid)                  set search_path = public;
alter function public.storage_path_is_own(text)             set search_path = public, storage;
alter function public.email_html(text, text, text, text)    set search_path = public;

-- ── 4. Les vues ne s'ouvrent qu'aux comptes connectés ────────────────────────
-- Elles sont déjà en `security_invoker` (un anonyme n'en tire aucune ligne),
-- mais il n'y a aucune raison de les exposer à un visiteur.

revoke all on public.v_candidates       from anon;
revoke all on public.v_role_stats       from anon;
revoke all on public.v_project_stats    from anon;
revoke all on public.v_profile_network  from anon;
