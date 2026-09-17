# Base de données — Let It Cast POC

Postgres managé par **Supabase** (Auth + Storage + RLS + Realtime).
Tout le schéma vit dans `supabase/migrations/`, appliqué via `scripts/db.mjs`.

## Pourquoi un script maison plutôt que la CLI Supabase

Les machines de dev ici n'ont ni Docker ni droits admin : pas de stack Supabase locale,
pas de `supabase db push`. `scripts/db.mjs` parle directement à la **Management API**
(`POST /v1/projects/{ref}/database/query`) et garde la trace des migrations appliquées
dans `public.schema_migrations`. Chaque fichier est joué dans **une transaction** :
un échec ne laisse pas de schéma à moitié appliqué.

```bash
printf 'sbp_xxx' > ~/.supabase-token && chmod 600 ~/.supabase-token  # une seule fois

npm run db -- create-project let-it-cast-poc   # crée le projet + affiche les clés
npm run db:push                                # applique les migrations pendantes
npm run db:status                              # ✓ / · par migration
npm run db:types                               # régénère src/types/database.generated.ts
npm run db -- query "select count(*) from public.profiles;"
```

Les clés vont dans `.env.local` (git-ignoré) — modèle dans `.env.example`.

## Migrations

| Fichier | Contenu |
| --- | --- |
| `20260917090000_init.sql` | enums, tables, contraintes, index, triggers `updated_at`, création auto du profil à l'inscription |
| `20260917090100_rls.sql` | helpers `security definer` + policies RLS de toutes les tables + garde de statut des candidatures |
| `20260917090200_storage.sql` | buckets `avatars` / `media` / `selftapes` + policies storage |
| `20260917090300_views.sql` | `v_candidates`, `v_role_stats`, `v_project_stats` (`security_invoker`) |
| `20260917090400_reference_data.sql` | langues + référentiel de compétences (données produit, pas de démo) |

## Modèle

### Le pivot : `applications`

```
casting_calls ──< roles ──< applications >── talent_profiles
                                 │
                                 ├──< self_tapes ──> media_assets
                                 ├──< candidate_reviews   (production uniquement)
                                 └──< candidate_notes     (production uniquement)
```

`applications` est **la seule** table de candidature. La ligne que le talent voit dans
*Auditions* est celle que la production voit dans *Candidates* : même `id`, même `status`,
mêmes timestamps. Le type front `Candidate` du selection console est une projection
(`v_candidates`), plus une entité parallèle.

`applications.status` :
`draft → submitted → viewed → under_review → shortlisted → callback → offer → cast`
(+ `not_selected`, `withdrawn`). Les colonnes du kanban studio et le stepper talent sont
deux **affichages** du même enum.

Un trigger (`applications_guard_status`) interdit au talent de poser un statut de décision :
il ne peut que `draft`, `submitted`, `withdrawn`. Tout le reste appartient à l'organisation.

### Autres blocs

- **Identité** : `auth.users` → `profiles` (créé par trigger à l'inscription, `account_type`
  = `talent | production`) → `talent_profiles` **ou** `production_profiles`.
- **Talent** : `talent_skills` (niveau 1–3) · `talent_languages` · `credits` · `training`
  · `media_assets`. Relationnel parce que ce sont des critères de recherche.
- **Production** : `organizations` → `organization_members` (`owner | admin | casting_director
  | member | viewer`) → `projects` → `casting_calls` → `roles`.
- **Fichiers** : `media_assets` centralise tout upload (`bucket` + `path` + métadonnées).
  Les tables métier référencent un asset, jamais une URL brute.
- **Messagerie** : `conversations` (rattachables à une application / projet / casting / rôle)
  → `conversation_members` (`last_read_at` = source des non-lus) → `messages`.
- **Notifications** : table unique `notifications` (type, entity, `read_at`).
- **Analytics** : `analytics_events (name, props jsonb)` — abstraction, pas d'outil tiers.

### Conventions

- `uuid` partout (`gen_random_uuid()`), `timestamptz` pour toute date-heure, `date` pour les
  dates de tournage.
- `sort_order` sur tout ce qui est réordonnable (credits, training, media, roles).
- Cohérence des tranches d'âge garantie en base (`playing_age_min <= playing_age_max`).
- Les tableaux `text[]` sont réservés aux critères d'un rôle (langues/accents/compétences
  souhaitées) ; côté talent tout est relationnel.
- `filters` des `saved_searches` reste en `jsonb` : c'est un instantané d'UI, pas une entité.
- **`profile_completion` n'est pas une colonne** : il est calculé côté front à partir du profil
  chargé (`src/features/talent/completion.ts`) pour éviter une valeur dérivée qui dérive.

## Sécurité

RLS activée sur **toutes** les tables. Les policies s'appuient sur des fonctions
`security definer` (`is_org_member`, `can_manage_org`, `application_org_id`, …) pour éviter
la récursion infinie d'une policy qui interroge la table qu'elle protège.

| Donnée | Qui lit | Qui écrit |
| --- | --- | --- |
| `profiles`, `talent_profiles` + satellites | tout utilisateur authentifié (profil pro = découvrable) | le propriétaire |
| `organizations`, `projects` `draft`, `casting_calls` `draft` | membres de l'org | `owner`/`admin`/`casting_director` |
| `casting_calls` publiés + `roles` | tout utilisateur authentifié | l'org |
| `applications` | le talent auteur **ou** l'org du projet | talent (créer/retirer), org (statut) |
| `candidate_reviews`, `candidate_notes` | **org uniquement** | membres de l'org |
| `media_assets` `kind = selftape` | propriétaire + org ayant reçu la candidature | propriétaire |
| `conversations`, `messages` | membres de la conversation | membres |
| `notifications` | destinataire | destinataire (`read_at`) |

Storage : `avatars` et `media` publics (lecture CDN), `selftapes` **privé** — lecture par URL
signée, autorisée seulement au propriétaire et à l'org qui review la candidature
(`can_read_selftape`). Convention de chemin `<profile_id>/<uuid>.<ext>` : l'appartenance est
déduite du chemin, personne n'écrit dans le dossier d'un autre.

Côté client, uniquement `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. La clé `service_role`
ne sert qu'aux scripts locaux et n'est jamais importée depuis `src/`.

## Types TypeScript

`src/types/database.ts` est écrit à la main et miroir des migrations (c'est le contrat des
repositories). `npm run db:types` produit `src/types/database.generated.ts` depuis le projet
réel — à comparer après chaque migration pour détecter une dérive.
