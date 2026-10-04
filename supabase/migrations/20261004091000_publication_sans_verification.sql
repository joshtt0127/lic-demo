-- Publication sans vérification d'organisation, pour l'instant (demande LIC).
--
-- La règle reste en place (`org_may_publish`, migration 20260924103000) ; on
-- ne fait que poser le réglage de plateforme prévu pour l'assouplir. Pour
-- rétablir la vérification : passer `require_verified_org` à 'true' — sans
-- redéployer. Une organisation suspendue reste bloquée dans tous les cas.

do $$
begin
  if exists (select 1 from vault.secrets where name = 'require_verified_org') then
    perform vault.update_secret(id, 'false') from vault.secrets where name = 'require_verified_org';
  else
    perform vault.create_secret('false', 'require_verified_org', 'Exiger une organisation vérifiée pour publier un casting public');
  end if;
end $$;
