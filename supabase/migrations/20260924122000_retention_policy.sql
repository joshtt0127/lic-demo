-- La rétention : préparée, pas inventée.
--
-- Combien de temps garde-t-on la self-tape de quelqu'un après la fermeture d'un
-- casting ? La réponse est juridique, pas technique — elle dépend du marché, du
-- régime applicable et de ce que LIC promet à ses utilisateurs. Coder « 12 mois »
-- ici reviendrait à prendre cette décision à la place de ceux dont c'est le rôle,
-- et à la cacher dans une migration.
--
-- Ce qui est construit : le **mécanisme**, et de quoi voir ce qu'il ferait.
--   · `platform_setting('selftape_retention_days')` porte la durée. Absente,
--     rien n'est purgé — le défaut sûr est de ne rien détruire ;
--   · `tapes_past_retention()` **liste** ce qui dépasserait cette durée, sans
--     rien supprimer. On peut donc regarder l'effet d'une valeur avant de
--     l'appliquer, ce qui est le minimum avant d'effacer la vidéo de quelqu'un.
--
-- La purge elle-même viendra avec la Phase 8 (privacy), quand la durée sera
-- tranchée et qu'on saura aussi quoi faire des comptes supprimés.

/**
 * Les self-tapes dont le casting est fermé depuis plus longtemps que la durée
 * de rétention. Aucune suppression : une liste, pour décider en connaissance.
 */
create or replace function public.tapes_past_retention()
returns table (
  self_tape_id    uuid,
  application_id  uuid,
  casting_call_id uuid,
  closed_at       timestamptz,
  bucket          text,
  path            text
)
language sql
stable
security definer
set search_path = public
as $$
  with policy as (
    select nullif(public.platform_setting('selftape_retention_days'), '')::int as days
  )
  select st.id,
         st.application_id,
         c.id,
         c.updated_at,
         m.bucket,
         m.path
    from public.self_tapes st
    join public.media_assets m on m.id = st.media_asset_id
    join public.applications a on a.id = st.application_id
    join public.roles r on r.id = a.role_id
    join public.casting_calls c on c.id = r.casting_call_id
   cross join policy
   where policy.days is not null
     and c.status in ('closed', 'archived')
     and c.updated_at < now() - make_interval(days => policy.days);
$$;

revoke all on function public.tapes_past_retention() from public, anon, authenticated;

comment on function public.tapes_past_retention() is
  'Liste ce qu''une purge supprimerait. Ne supprime rien. La durée vient de platform_setting(selftape_retention_days).';
