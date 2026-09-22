-- Suite du durcissement : retirer de l'API ce qui n'a rien à y faire.
--
-- L'advisor remonte 26 fonctions `security definer` appelables par un compte
-- connecté via `/rest/v1/rpc/…`. Il faut les séparer en deux familles :
--
--  · les **helpers de policy** (`is_org_member`, `application_org_id`, …) :
--    une policy s'évalue avec les droits de l'appelant, donc `authenticated`
--    doit garder le droit de les exécuter. Les révoquer casserait la lecture
--    de toutes les tables concernées. Ils restent, et c'est le motif du WARN
--    résiduel — c'est le prix du modèle RLS de Supabase.
--
--  · les **fonctions de trigger** : PostgreSQL ne vérifie pas le droit
--    d'exécution de l'appelant pour un trigger, donc personne n'a besoin de
--    pouvoir les appeler. Elles n'ont aucune raison d'être une route RPC.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', fn.signature);
  end loop;
end
$$;

-- Les fonctions d'e-mail ne servent qu'aux triggers et à la réconciliation.
revoke execute on function public.email_html(text, text, text, text)
  from anon, authenticated, public;
