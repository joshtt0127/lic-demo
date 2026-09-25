-- Les données personnelles d'un comédien ne sont plus lisibles par tout le monde.
--
-- C'est le P1 le plus ancien de l'audit, et le plus gênant : `talent_profiles`
-- était lisible par **n'importe quel compte connecté**. Vérifié à l'époque avec
-- une session de comédienne ordinaire : dix profils lus, avec l'e-mail et le
-- téléphone de leur agent, leur genre, leur taille, leurs nationalités et leur
-- ethnicité. Un comédien n'a aucune raison de lire ça chez un autre, et
-- l'ethnicité est une donnée sensible au sens du RGPD.
--
-- Qui garde l'accès, et pourquoi :
--   · **la personne elle-même** — c'est son profil ;
--   · **les membres d'une organisation** — chercher un comédien sur des critères
--     de jeu (âge, langues, genre) *est* le métier du casting, et l'annuaire
--     production repose dessus ;
--   · **le support LIC** — pour traiter un ticket, sans accès au contenu privé
--     par ailleurs.
--
-- Et pour que le fil social continue de fonctionner, une vue étroite : le nom
-- professionnel et l'accroche, rien d'autre. C'est ce qu'affiche une carte de
-- publication, et c'est tout ce qu'elle a besoin de savoir.
--
-- ⚠️ Décision produit laissée ouverte (PD-03) : faut-il aller plus loin et
-- réserver les coordonnées de l'agent aux seules productions chez qui le
-- comédien a candidaté ? Ça demanderait de sortir ces deux colonnes dans leur
-- propre table — une migration destructive que je ne prends pas tout seul.
-- En attendant, elles sont fermées à tous les comptes non-production, ce qui
-- règle l'essentiel de la fuite.

/**
 * La carte d'un comédien telle qu'elle apparaît dans le fil.
 *
 * Volontairement **sans** `security_invoker` : la vue appartient au propriétaire
 * du schéma et contourne la policy de la table. C'est le seul moyen d'exposer
 * deux colonnes à tout le monde sans ouvrir la ligne entière — une policy est
 * une règle de ligne, pas de colonne.
 */
create or replace view public.v_talent_card as
  select profile_id, professional_name, headline
    from public.talent_profiles;

revoke all on public.v_talent_card from anon, public;
grant select on public.v_talent_card to authenticated;

comment on view public.v_talent_card is
  'Nom professionnel et accroche, pour les cartes du fil. Aucune donnée personnelle.';

-- ── La table, elle, se referme ────────────────────────────────────────────

drop policy if exists talent_profiles_read on public.talent_profiles;
create policy talent_profiles_read on public.talent_profiles
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
       where m.profile_id = auth.uid() and m.status = 'active'
    )
    or public.is_lic_support()
  );
