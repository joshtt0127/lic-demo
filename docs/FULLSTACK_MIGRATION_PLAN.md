# Let It Cast — Plan de migration full-stack

> De **démo front-only** (fixtures + localStorage) à **POC produit** (Postgres + Auth + Storage),
> sans repartir de zéro : on garde l'UI, la DA et les interactions déjà construites.

**Date** : 17 septembre 2026
**Repo** : `joshtt0127/lic-demo` (fork de `danohayon-create/lic-demo`)
**Référence démo actuelle** : `/studio` (production) · `/talent` (talent desktop) · `/app` (talent mobile)

---

## 1. Architecture existante (audit)

### 1.1 Stack

| Couche | Techno | Remarque |
| --- | --- | --- |
| Build | Vite 5 | `base: '/lic-demo/'` si `GITHUB_PAGES` → déploiement GitHub Pages |
| UI | React 18 + TypeScript strict | `noUnusedLocals`/`noUnusedParameters` activés |
| Routing | React Router 6 (`createBrowserRouter`) | 3 surfaces, 1 seule app |
| Styling | Tailwind 3 + tokens JS miroir (`src/styles/tokens.ts`) | DA propre et cohérente, à conserver |
| Animation | framer-motion 11 | `PageTransition` par route |
| Icônes | lucide-react | |
| Charts | recharts | couleurs issues des tokens |
| Fonts | Inter Variable + IBM Plex Mono (`@fontsource`) | |
| **Backend** | **aucun** | 0 dépendance réseau, 0 auth, 0 DB |

~20 700 lignes de TS/TSX dans `src/`, ~560 Mo d'assets dans `public/` (posters, self-tapes, vidéos non-scripted).

### 1.2 Structure

```
src/
  router.tsx            3 surfaces : /studio, /app, /talent (+ / launcher, /pitch)
  pages/                Launcher, Pitch
  studio/               Production desktop (14 écrans, 2 très gros fichiers)
  talent/               Talent desktop "LinkedIn" (7 écrans)
  app/                  Talent mobile dans PhoneFrame (7 écrans)
  components/           PhoneFrame, CommandPalette, EditModal, Toast, Skeleton, PageTransition
  components/ui/        Logo, Button, Card, Tag, Avatar, PasswordGate  ← design system
  data/                 fixtures typées + 3 stores localStorage
  styles/tokens.ts      tokens miroir Tailwind
  lib/                  cn(), asset()
```

Poids par écran (lignes) : `NewCasting` 3393 · `SelectionConsole` 3003 · `RoleReview` 971 ·
`TalentProfilePage` 824 · `CommandCenter` 758 · `CastingSearch` 732 · `Review` 644 · `Dashboard` 643 ·
`SelfTape` 619. Les deux premiers sont la dette technique principale (à découper, pas à réécrire).

### 1.3 Données — état réel

Tout vit dans `src/data/`, typé dans `types.ts` (438 lignes), barrel `index.ts`.

| Fichier | Contenu | Persistance |
| --- | --- | --- |
| `talents.ts` | 12+ talents, `mayaProfile` (profil complet Maya Reyes) | statique |
| `team.ts` | 6 membres production, `studioUser = team[0]` (Peter Known) | statique |
| `projects.ts` (1264 l.) | `projects[]` **et** `roles[]`, KPIs, activity, discover castings | statique |
| `selection.ts` (956 l.) | ~100 `Candidate` (≠ Talent !), votes, pipeline | **localStorage** `lic-selection-state-v13` |
| `castingState.ts` | statut/format de casting par rôle | **localStorage** `lic-casting-state` |
| `savedSearches.ts` | recherches sauvegardées du selection console | **localStorage** `lic-saved-searches-v1` |
| `auditions.ts` | 4 auditions de Maya + insights + sparkline | statique |
| `messages.ts` | 4 conversations, messages, `unreadMessagesCount` | statique (const module) |
| `notifications.ts` | 6 notifications | statique |
| `feed.ts`, `sides.ts`, `sceneAnalysis.ts`, `search.ts` | feed social, sides, analyse IA, état de recherche | statique |

Pattern de store existant (à conserver comme *seam*) : `useSyncExternalStore` + `load()/persist()` +
cache de référence stable. C'est exactement la forme d'un hook de data-fetching → la bascule vers
Supabase se fait **sans changer les composants**.

Autres persistances : `sessionStorage` `lic-ns-wizard` (wizard NewCasting), `lic-demo-unlocked`
(`PasswordGate`, SHA-256 en dur → à remplacer par la vraie auth).

### 1.4 Ce qui fonctionne déjà vraiment (à ne pas casser)

- Navigation réelle sur les 3 surfaces, transitions, command palette ⌘K.
- **Selection console** : kanban 7 colonnes, list view, wall, drag & drop, colonnes verrouillées,
  colonnes à occupant unique (`offer`/`cast`), votes équipe, score pondéré, filtres multi-critères,
  saved searches — persistés en localStorage.
- **NewCasting** : wizard complet scripted / non-scripted avec reprise d'étape (sessionStorage).
- **Talent profile** : édition de quasi toutes les sections via `EditModal` — mais en `useState` uniquement.
- **Self-tape** : lecture sides, player, UI d'enregistrement.
- Design system sobre et premium : `paper/ink/muted/cream/gold` + système de signal `no/maybe/good`.

### 1.5 Dette technique identifiée

1. **Double modèle candidat** : `Candidate` (selection.ts) et `Talent`/`TalentProfile` (talents.ts)
   sont deux entités déconnectées. C'est *le* blocage single-source-of-truth : un candidat du studio
   n'est pas un talent de la plateforme.
2. **Auditions talent ≠ candidatures studio** : `auditions.ts` (4 entrées Maya) et `selection.ts`
   (~100 candidats) ne se rencontrent jamais. Les deux côtés de la marketplace sont désolidarisés.
3. Agrégats calculés à l'import (`unreadMessagesCount`, `kpis` figés) → doivent devenir dérivés de la DB.
4. Dates/durées en chaînes d'affichage (`'Sep 14'`, `'3d 04h'`, `'Sent 3d ago'`) → `timestamptz` + formatage.
5. IDs slug en dur (`'maya-reyes'`, `'fanny-brice'`) → uuid + slug optionnel.
6. Textes UI en dur dans les composants → aucune couche i18n.
7. `NewCasting.tsx` / `SelectionConsole.tsx` monolithiques.
8. Aucun test, aucun lint configuré, `npm run build` = `tsc --noEmit && vite build`.
9. ~560 Mo d'assets versionnés dans `public/` → à terme Storage + thumbnails.
10. `PasswordGate` (hash en dur) sert d'« auth » de démo.

---

## 2. Cartographie des fonctionnalités → décisions

Légende : **KEEP** · **KEEP+CONNECT** (UI conservée, données réelles) · **REFACTOR** · **REPLACE** · **REMOVE** · **BUILD**

### 2.1 Socle / transverse

| Feature | Fichier(s) | État actuel | Décision | Évolution |
| --- | --- | --- | --- | --- |
| Launcher 3 surfaces | `pages/Launcher.tsx` | choix de surface démo | REFACTOR | devient landing + Sign in / Sign up ; les 3 entrées restent en mode "demo tour" |
| PasswordGate | `components/ui/PasswordGate.tsx` | SHA-256 en dur, sessionStorage | REPLACE | Supabase Auth (email + password) |
| Auth (signup/login/logout/reset) | — | inexistant | BUILD | `AuthProvider` + routes `/auth/*` + guards |
| Account type (talent/production) | — | inexistant | BUILD | `profiles.account_type` + onboarding commun |
| Access control | conditions locales | inexistant | BUILD | `lib/access.ts` centralisé + RLS Postgres |
| Design system | `components/ui/*` | 5 composants | KEEP + étendre | ajout Input/Modal/Drawer/Tabs/Dropdown/Table/Skeleton *dans la même DA* |
| Toast | `components/Toast.tsx` | OK | KEEP+CONNECT | branché sur les résultats de mutation (succès/erreur) |
| i18n EN/FR | — | textes en dur | BUILD | `locales/{en,fr}`, `useT()`, persistance du choix sur `profiles.locale` |
| États loading/empty/error | partiels (`Skeleton`) | UI optimiste | BUILD | convention par écran (query state) |
| Analytics | — | inexistant | BUILD | `lib/analytics.ts` (abstraction, sink console + table `analytics_events`) |
| Tests | — | aucun | BUILD | Vitest (unitaire/règles) + Playwright (2 parcours E2E) |

### 2.2 Talent space

| Feature | Fichier(s) | État actuel | Décision | Évolution |
| --- | --- | --- | --- | --- |
| Talent onboarding | — | inexistant | BUILD | wizard multi-étapes, skip, `profile_completion` |
| Profil talent (lecture) | `talent/TalentProfilePage.tsx` | UI riche depuis `mayaProfile` | KEEP+CONNECT | lit `talent_profiles` + tables liées |
| Édition profil | idem, `EditModal` | `useState` uniquement | KEEP+CONNECT | mutations DB, survit au refresh/reconnexion |
| Appearance / casting details | idem | fixture | KEEP+CONNECT | colonnes dédiées `talent_profiles` |
| Skills + niveaux | idem | `skillLevels: Record<string,1|2|3>` | KEEP+CONNECT | `skills` + `talent_skills(level)` |
| Langues | idem | `string[]` | KEEP+CONNECT | `languages` + `talent_languages` |
| Credits | idem | fixture éditable en local | KEEP+CONNECT | table `credits` (ordonnée) |
| Training | idem | fixture | KEEP+CONNECT | table `training` |
| Media (headshots/portfolio/showreels/self-tapes) | idem, presets `/posters/*` | choix parmi presets | REPLACE | upload réel → Storage + `media_assets(kind)` |
| Casting calls (talent) | `talent/CastingCalls.tsx`, `TalentCastingDetail.tsx` | fixtures projets | KEEP+CONNECT | castings `published` + filtres serveur |
| Save casting | — / local | inexistant | BUILD | `saved_castings` |
| Apply | `app/CastingDetail.tsx`, `SnapApplyTips` | navigation + toast | KEEP+CONNECT | crée une `applications` réelle |
| Auditions | `talent/TalentAuditions.tsx`, `app/Auditions.tsx` | `auditions.ts` (4 fixtures) | KEEP+CONNECT | = mes `applications` (même entité que côté studio) |
| Self-tape | `app/SelfTape.tsx` | player + UI record | KEEP+CONNECT | upload Storage privé + `self_tapes` liée à l'application |
| Messages | `talent/Messages.tsx` | fixtures, état local | KEEP+CONNECT | `conversations`/`messages` partagées avec le studio |
| Notifications | `talent/Notifications.tsx` | fixtures | KEEP+CONNECT | table `notifications` + read/unread |
| Feed social | `studio/HomeFeed.tsx`, `app/MobileFeed.tsx` | fixtures riches (vidéos, YouTube) | KEEP (hors route) | P6 — `HomeFeed` n'est plus monté : `/talent` affiche désormais un vrai tableau de bord (`talent/TalentHome.tsx`). Le fichier reste comme base du futur feed |
| Performance profile (carte sombre) | `TalentProfilePage.tsx` | barres de scores fixtures | **REPLACE** | remplacée par **Profile strength** (complétion réelle + ce qu'il manque). Le scoring de performance revient avec le slice matching (P5) quand il y aura des auditions à mesurer — afficher des barres sans données serait un faux |
| Activity / posts (profil) | `TalentProfilePage.tsx` | posts fixtures + composer | **REMOVE (temporaire)** | le composer n'écrivait nulle part ; revient avec le feed (P6) et sa table |
| Match IA / scene analysis | `sceneAnalysis.ts` | scores fixtures | KEEP | scoring déterministe côté serveur plus tard (P5) |

### 2.3 Production side

| Feature | Fichier(s) | État actuel | Décision | Évolution |
| --- | --- | --- | --- | --- |
| Production onboarding | — | inexistant | BUILD | profil + create/join organization |
| Organisations & membres | `team.ts` (6 fixtures) | statique | BUILD | `organizations` + `organization_members(role)` + invitations |
| Dashboard / Command center | `studio/CommandCenter.tsx`, `Dashboard.tsx` | KPIs figés | KEEP+CONNECT | KPIs dérivés (vues SQL), chaque CTA réel |
| Projects | `projects.ts` | fixtures | KEEP+CONNECT + BUILD (CRUD) | `projects` + statuts + artwork |
| Casting calls | `studio/NewCasting.tsx` (wizard) | sessionStorage | KEEP+CONNECT | `casting_calls` draft→published→closed |
| Roles + critères | `projects.ts` `roles[]` | fixtures | KEEP+CONNECT | `roles` + critères exploitables par la recherche |
| Casting recap | `studio/CastingRecap.tsx` | fixtures | KEEP+CONNECT | lit le casting créé |
| Talent search | `studio/SearchScreen.tsx`, `CastingSearch.tsx` | filtres sur fixtures | KEEP+CONNECT | requêtes Postgres + pagination |
| Saved searches | `savedSearches.ts` | localStorage | KEEP+CONNECT | table `saved_searches` |
| Selection console (kanban/list/wall) | `studio/SelectionConsole.tsx`, `Wall.tsx` | localStorage, entité `Candidate` | **REFACTOR + CONNECT** | `Candidate` devient une **vue** de `applications ⋈ talent_profiles` |
| Role review / self-tape review | `studio/RoleReview.tsx`, `Review.tsx` | fixtures + votes locaux | KEEP+CONNECT | lecture self-tape privée, `candidate_reviews`, `candidate_notes` |
| Team review (no/maybe/good) | `selection.ts` `raterVotes` | localStorage | KEEP+CONNECT | `candidate_reviews(reviewer_id, vote, comment)` |
| Statut candidat | `selection.ts` | localStorage | KEEP+CONNECT | `applications.status` (source unique) |
| Bulk actions / filtres / saved views | `SelectionConsole.tsx` | local | KEEP+CONNECT | mutations serveur |
| Messaging studio | — | inexistant côté studio | BUILD | même backend que le talent |
| Notifications studio | bouton toast | faux | REPLACE | table `notifications` |
| Agency select | `studio/AgencySelect.tsx` | fixture | KEEP | P6 |
| Talent mobile app `/app` | `app/*` | démo dans PhoneFrame | KEEP+CONNECT (partiel) | P3+ : `/app/selftape/:id` et Apply branchés ; le reste reste vitrine |
| Pitch | `pages/Pitch.tsx` | placeholder | KEEP | hors POC |

### 2.4 À supprimer

Rien de significatif. `PasswordGate` est **remplacé** par l'auth (fichier retiré une fois l'auth en place).
Les fixtures ne sont pas supprimées : elles deviennent des **seeds** (§ 5).

---

## 3. Architecture cible

```
┌─ React SPA (Vite) ────────────────────────────────────────────┐
│  pages / studio / talent / app        ← UI inchangée          │
│  features/*                           ← hooks métier          │
│  data/repositories/*                  ← accès données (seam)  │
│  lib/supabase.ts  lib/access.ts  lib/i18n  lib/analytics.ts   │
└───────────────────┬───────────────────────────────────────────┘
                    │ supabase-js (PostgREST + Auth + Storage + Realtime)
┌───────────────────▼───────────────────────────────────────────┐
│ Supabase : Postgres (RLS) · Auth · Storage · Realtime         │
│ buckets : avatars(public) media(public) selftapes(private)    │
└───────────────────────────────────────────────────────────────┘
```

**Pourquoi Supabase** : Postgres réel + auth + storage + RLS en une seule brique, suffisant pour le POC,
déployable en quelques minutes, zéro serveur à maintenir. Pas de microservices.

**Règle d'architecture (le point clé)** : les composants n'appellent **jamais** `supabase` directement.
Ils consomment des hooks (`useTalentProfile`, `useRoleCandidates`, …) dont la signature est **identique**
à celle des stores actuels. On remplace l'implémentation, pas l'UI.

```ts
// avant : src/data/selection.ts
export function useRoleCandidates(roleId: string): Candidate[]
// après : src/features/applications/useRoleCandidates.ts
export function useRoleCandidates(roleId: string): QueryState<Candidate[]>
```

Nouvelles dépendances (volontairement minimales) :
`@supabase/supabase-js`, `@tanstack/react-query` (cache/loading/erreur/invalidation),
`zod` (validation formulaires), `vitest` + `@testing-library/react`, `@playwright/test`.

---

## 4. Modèle de données

### 4.1 Schéma

```text
auth.users (Supabase)
  └─ profiles (id = auth.uid, account_type, first_name, last_name, avatar_url, locale,
               city, country, onboarding_step, onboarding_completed_at)
       ├─ talent_profiles (profile_id PK, professional_name, headline, bio, cover_url,
       │                   gender, playing_age_min/max, height_cm, nationalities[],
       │                   union_name, ethnicities[], availability, website,
       │                   agency_name, agent_name, agent_email, agent_phone,
       │                   profile_completion smallint)
       │    ├─ talent_skills (talent_id, skill_id, level 1..3)        → skills(name, category)
       │    ├─ talent_languages (talent_id, language_id, fluency)     → languages(code, name)
       │    ├─ talent_accents (talent_id, accent)
       │    ├─ credits (title, role_name, category, year, director, company, location, url, sort_order)
       │    ├─ training (school, program, start_year, end_year, description, sort_order)
       │    └─ media_assets (owner_profile_id, kind headshot|portfolio|showreel|selftape|avatar|cover,
       │                     bucket, path, mime, bytes, width, height, duration_s, caption, sort_order)
       └─ production_profiles (profile_id PK, job_title, phone)

organizations (name, slug, logo_url, description, website, company_type, city, country, created_by)
  └─ organization_members (org_id, profile_id, role owner|admin|casting_director|member|viewer, status)
  └─ organization_invites (org_id, email, role, token, expires_at, accepted_at)

projects (org_id, title, subtitle, synopsis, director_brief, production_type, genre,
          company_name, director_name, casting_director_name, poster_url,
          shooting_location, shooting_start, shooting_end,
          status draft|casting|callbacks|pre_production|cast|archived)
  └─ project_members (project_id, profile_id, role)
  └─ casting_calls (project_id, title, description, location, deadline_at,
                    compensation, visibility public|private, format scripted|non_scripted,
                    status draft|published|closed|archived, published_at)
       └─ roles (casting_call_id, name, description, role_type lead|supporting|contestant,
                 gender_pref, playing_age_min/max, location, languages[], accents[],
                 skills[], requirements, compensation, selftape_instructions,
                 sides_url, shooting_start, shooting_end, status,
                 audition_flow open_call|invited|in_house, sort_order)
            └─ applications (role_id, talent_id, status, note, headshot_id, showreel_id,
                             submitted_at, viewed_at, decided_at, source)
                 ├─ self_tapes (application_id, media_asset_id, duration_s, submitted_at)
                 ├─ application_media (application_id, media_asset_id)
                 ├─ candidate_reviews (application_id, reviewer_id, vote no|maybe|good, comment)
                 └─ candidate_notes (application_id, author_id, body, visibility team|private)

saved_searches (owner_profile_id, project_id?, name, filters jsonb)
saved_castings (talent_id, casting_call_id)

conversations (subject, context_type application|project|casting_call|role|direct, context_id,
               org_id?, last_message_at)
  ├─ conversation_members (conversation_id, profile_id, last_read_at)
  └─ messages (conversation_id, sender_id, body, created_at)

notifications (recipient_id, type, title, body, entity_type, entity_id, read_at, created_at)
analytics_events (profile_id?, name, props jsonb, created_at)
```

### 4.2 Décisions de modélisation

- **`applications` est l'entité pivot** : ce que le talent voit dans *Auditions* et ce que la production
  voit dans *Candidates* est **la même ligne**. Le type front `Candidate` devient une projection
  (`v_candidates` : application ⋈ talent_profile ⋈ agrégats de reviews) — plus de duplication.
- **`status` unique** sur `applications` :
  `draft | submitted | viewed | under_review | shortlisted | callback | offer | cast | not_selected | withdrawn`.
  Les colonnes du kanban studio et les libellés talent sont deux **vues** du même enum.
- **Relationnel plutôt que JSON** pour skills / langues / credits / training / media : ce sont des
  critères de recherche. `filters` des saved searches reste en `jsonb` (snapshot d'UI, pas une entité).
- **`media_assets` centralise tous les fichiers** ; les tables métier référencent un asset, jamais une URL brute.
- Playing age stocké en deux colonnes int + contrainte `min <= max` (cohérence exigée au § 35 du brief).
- Timestamps `timestamptz` partout ; tout l'affichage relatif ("3d ago") devient du formatage front i18n.
- `sort_order` sur tout ce qui est réordonnable (credits, training, media, roles).

### 4.3 Sécurité (RLS)

| Table | Lecture | Écriture |
| --- | --- | --- |
| `profiles` | tout le monde (champs publics) | soi-même |
| `talent_profiles` + tables liées | public (profil pro visible) | le talent propriétaire |
| `media_assets` kind=selftape | propriétaire + membres de l'org du rôle postulé | propriétaire |
| `organizations` | membres (+ nom/logo publics) | owner/admin |
| `projects`, `casting_calls` `draft` | membres de l'org | owner/admin/casting_director |
| `casting_calls` `published` + `roles` | tout utilisateur authentifié | org |
| `applications` | le talent auteur **ou** un membre de l'org du projet | talent (create/withdraw), org (status) |
| `candidate_reviews`, `candidate_notes` | **org uniquement** — jamais le talent | membres de l'org |
| `conversations`, `messages` | membres de la conversation | membres |
| `notifications` | destinataire | destinataire (read_at) |

Bucket `selftapes` **privé** → lecture via URL signée générée seulement si la policy passe.
Aucune clé sensible côté client : uniquement `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (clé publique
prévue pour ça, protégée par RLS). `service_role` réservée aux scripts locaux (seed), jamais dans le bundle.

---

## 5. Seeds

Les fixtures actuelles deviennent des seeds SQL/TS idempotents (`scripts/seed.ts`, clé `service_role` locale) :

- **Talent démo** : `maya@letitcast.demo` → Maya Reyes, profil complet (credits, training, media, skills).
- **Production démo** : `peter@letitcast.demo` (casting director, owner de l'org **A24**) + Eden Tov,
  Julie Cohen, Lara Khan comme membres.
- **Projets** : Evermore, Rive Droite, Echo Park, Les Ombres de Midi (+ rôles et castings publiés).
- **Candidatures** : les candidats de `selection.ts` deviennent des talents + applications réelles
  (volume réduit à ~40 pour rester lisible), self-tapes pointant sur les vidéos de `public/media`.
- Mot de passe démo unique par `.env` local, **jamais commité**.

---

## 6. Vertical slices (ordre d'exécution)

Une branche par slice, `tsc` + build + tests verts avant merge, push à chaque étape.

| # | Branche | Contenu | Priorité brief | État |
| --- | --- | --- | --- | --- |
| 0 | `feat/fullstack-migration-plan` | ce document, `docs/*`, `.env.example` | — | ✅ |
| 1 | `feat/database-schema` | migrations SQL, RLS, buckets, vues, client typé, CLI `db.mjs` | P0 | ✅ |
| 2 | `feat/auth` | signup/login/logout/reset, session persistante, guards, states | P0 | ✅ |
| 3 | `feat/talent-onboarding` | account type, wizard talent, upload réel, profile completion | P0 | ✅ |
| 4 | `feat/talent-profile` | profil talent 100 % connecté + édition persistée + media upload | P0 | ✅ |
| 5 | `feat/production-onboarding` | profil production, create/join organization | P1 | ✅ |
| 6 | `feat/projects` | CRUD projets + artwork + statuts | P1 |
| 7 | `feat/casting-calls` | casting calls + rôles + publication (wizard branché) | P1 |
| 8 | `feat/applications` | apply talent → candidatures studio (**North Star**) | P2 | ⏳ côté talent fait (apply réel), côté studio à brancher |
| 9 | `feat/self-tapes` | upload privé + review player | P3 |
| 10 | `feat/casting-console` | kanban/list/wall + statuts + reviews + notes persistés | P3 |
| 11 | `feat/messaging` | conversations partagées talent ↔ production | P4 | ⏳ côté talent fait |
| 12 | `feat/notifications` | notifications persistantes + badges réels | P4 | ✅ triggers DB + badges réels |
| 13 | `feat/search` | talent search serveur + saved searches DB | P5 |
| 14 | `feat/i18n` | EN/FR, extraction des textes, sélecteur persistant | transverse |
| 15 | `feat/e2e` | Playwright : les 2 parcours + le test croisé du § 44 | transverse |

**Slice 1 = le premier vertical slice fonctionnel** au sens du brief (§ 56) : slices 1→4 forment le
bloc AUTH + ACCOUNT TYPE + ONBOARDING + PROFIL + DB + STORAGE, démontrable de bout en bout.

**North Star technique** (slices 7→12) : *production crée un casting → talent postule → production
review → change le statut → talent voit le changement → les deux se parlent.*

---

## 7. Critères de sortie du POC

- [ ] Deux comptes créés depuis l'UI, deux sessions parallèles, aucun faker.
- [ ] Le test croisé du § 44 du brief passe en manuel **et** en Playwright.
- [ ] Refresh et reconnexion : aucune donnée perdue.
- [ ] Aucun bouton visible qui ne fait rien (audit des `toast('… coming soon')` restants).
- [ ] RLS vérifiée : un talent ne lit ni les notes, ni les votes, ni les self-tapes des autres.
- [ ] `tsc --noEmit` + `vite build` + tests verts.
- [ ] `README` permettant à un dev de lancer le projet en < 10 min.

---

## 8. Décisions ouvertes

1. **Projet Supabase** : le POC a besoin d'un projet cloud (pas de Docker sur la machine de dev, donc
   pas de stack Supabase locale). Les migrations sont écrites et versionnées dans `supabase/migrations/`
   et s'appliquent dès que le projet existe.
2. **Hébergement** : Vercel recommandé (SPA + variables d'env + preview deployments) plutôt que
   GitHub Pages, qui ne gère pas les variables d'environnement de build proprement pour deux environnements.
3. **`/app` mobile** : reste une vitrine démo hors parcours self-tape/apply, qui sont branchés.
4. **Feed social** : conservé en fixtures (P6), isolé derrière un repository pour pouvoir être branché plus tard.
