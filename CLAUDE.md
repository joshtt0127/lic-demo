# Let It Cast — démo investisseur

Webapp de casting (type « LinkedIn + Cast It Talent + TikTok pour acteurs »).
**En migration vers un POC full-stack** : Supabase (Postgres + Auth + Storage + RLS)
remplace progressivement les fixtures. Voir `docs/FULLSTACK_MIGRATION_PLAN.md` pour
l'ordre des slices et `docs/DATABASE.md` pour le modèle de données.
Règle absolue : pas de faux bouton — ce qui est visible doit fonctionner réellement
et survivre à un refresh / une reconnexion.

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS** (v3, `tailwind.config.js` + tokens dans `src/styles/tokens.ts`)
- **React Router v6** (`createBrowserRouter`, voir `src/router.tsx`) — navigation réelle
- **framer-motion** (transitions / micro-animations)
- **lucide-react** (icônes)
- **recharts** (graphiques — utiliser les couleurs de `src/styles/tokens.ts`)
- Polices : **Inter** (variable) + **IBM Plex Mono** via `@fontsource` (importées dans `src/index.css`)
- **Supabase** (`@supabase/supabase-js`) — client unique dans `src/lib/supabase.ts`
- **@tanstack/react-query** — cache / loading / erreurs des données serveur
- **zod** — validation des formulaires (`src/features/auth/validation.ts`)
- **vitest** + @testing-library/react — tests unitaires et de rendu

Commandes : `npm run dev` · `npm run build` · `npm run typecheck` · `npm test` ·
`npm run db:push` (migrations) · `npm run db:types`.

## Auth & access control

- `src/features/auth/AuthProvider.tsx` — session Supabase persistée + profil (`profiles`),
  `signUp` / `signIn` / `signOut` / reset de mot de passe / `setAccountType`.
- `src/features/auth/guards.tsx` — `RequireAuth`, `RequireSurface` (talent vs studio),
  `RedirectIfSignedIn`. Les guards attendent la restauration de session (`ready`) :
  un refresh sur une page protégée ne doit jamais flasher l'écran de connexion.
- `src/lib/access.ts` — **source unique** des règles d'accès : `homeRouteFor`,
  `canAccessSurface`, capacités par rôle d'organisation (`can(role, capability)`).
  Ne jamais écrire de `if (user.type === …)` dans un composant.
- Onboarding commun : `/onboarding` (choix talent/production puis identité), reprise
  automatique à l'étape en cours depuis l'état du profil.
- `src/data/repositories/*` — accès aux tables. Les composants passent par un
  repository ou un hook, jamais par `supabase` directement.

## Architecture / routing

Trois surfaces dans une seule app (+ `/auth/*` et `/onboarding`) :

| Route            | Surface                              | Layout |
| ---------------- | ------------------------------------ | ------ |
| `/`              | Launcher de la démo                  | `pages/Launcher.tsx` |
| `/pitch`         | Pitch (placeholder)                  | `pages/Pitch.tsx` |
| `/studio/*`      | **Production** (desktop, pleine largeur) | `studio/StudioLayout.tsx` |
| `/app/*`         | **Talent mobile** (dans un cadre iPhone) | `app/AppLayout.tsx` |
| `/talent/*`      | **Talent desktop** (fiche façon LinkedIn, pleine largeur) | `talent/TalentDesktopLayout.tsx` |

- **Studio** sous-routes : `/studio` (feed), `/studio/dashboard`, `/studio/search`, `/studio/review`.
- **App** sous-routes : `/app` (découverte), `/app/profile`, `/app/casting/:id`, `/app/selftape/:id`, `/app/auditions`.
- L'app talent mobile s'affiche **à l'intérieur d'un cadre de téléphone** (`components/PhoneFrame.tsx`),
  centré sur fond neutre, avec une zone scrollable interne et une **tab bar en bas dans le cadre** :
  Casting calls · Snap apply · Auditions · Profile.
- **Talent desktop** (`/talent`) : espace complet avec nav du haut façon LinkedIn (Home · Casting calls ·
  Auditions · Messages · Notifications · My profile), badges non-lus sur Messages/Notifications.
  - `/talent` (Home) : réutilise directement `studio/HomeFeed.tsx`.
  - `/talent/casting-calls` : castings qui matchent Maya, CTA direct vers le self-tape (`/app/selftape/:id`).
  - `/talent/auditions` : avancement de chaque audition (stepper Self-tape → Submitted → Under review → Shortlisted).
  - `/talent/messages` : messagerie interne (liste de conversations + thread), état React local.
  - `/talent/notifications` : flux d'alertes (nouveau casting, statut d'audition, message) avec lu/non-lu.
  - `/talent/profile` : fiche talent type LinkedIn (`talent/TalentProfilePage.tsx`), entièrement éditable en
    local (cover/avatar, headline, bio, skills + niveau de maîtrise, appearance — genre/ethnicités/playing age,
    expériences/credits avec lieu + site web, photos & book / self-tapes séparés, training, posts) via
    `components/EditModal.tsx` — état React local initialisé depuis `mayaProfile`, pas de persistance.

## Données (fixtures)

Tout vit dans **`src/data/`**, typé dans `src/data/types.ts`, ré-exporté par `src/data/index.ts`.
**L'app lit toujours depuis ces fixtures — ne jamais coder de données métier dans l'UI.**

- `talents.ts`, `users.ts` (production + équipe), `projects.ts` (projets **et** rôles),
  `auditions.ts`, `feed.ts`, `sides.ts`, `sceneAnalysis.ts`.
- ⚠️ Contenu actuel = **placeholder** : sera remplacé par les données de l'annexe.
  Chaque fichier expose un tableau + un index `…ById`.

## Design system

Tokens : Tailwind (`tailwind.config.js`) + miroir JS (`src/styles/tokens.ts`).

**Couleurs**
- Fond global `paper` `#F6F5F1` (blanc cassé chaud) · cartes `card` `#FFFFFF` · bordure `line` `#ECEAE4`
- Texte `ink` `#15140F` · secondaire `muted` `#6E6A60`
- Premium CTA `cream` `#F1E4C3` (Snap apply / Self Tape, souvent avec icône éclair) · or vif `gold` `#F2C200`
- Signal (notation, partout) : `signal-no` `#E0483D` · `signal-maybe` `#F4B400` · `signal-good` `#2BA36B` (sélectionné : fond `signal-good-bg` `#E7F6EE`)
- Score de match `match` `#16A34A` · liens `link` `#2563EB`

**Typo / formes**
- Beaucoup de petits labels **MAJUSCULES**, gris, large letter-spacing → classe util `.tech-label`
- Mono (IBM Plex Mono) `font-mono` pour timecodes / labels techniques
- Rayons : cartes `rounded-card` (18px) · boutons `rounded-btn` (12px) · pills `rounded-full`
- Ombres : `shadow-card`, `shadow-card-hover`, `shadow-phone`

**Composants réutilisables** (`src/components/ui/`, barrel `index.ts`) :
`Logo` (wordmark + mark 3 carrés jaune/bleu/rouge en SVG), `Button` (variants `primary`/`secondary`/`ghost`/`premium`),
`Card`, `Tag` (tones neutral/good/maybe/no/gold/cream/link), `Avatar`.
Utilitaire `cn()` dans `src/lib/cn.ts`.

**Couche "qualité démo"** (`src/components/`) :
- `Toast.tsx` — `ToastProvider` (monté dans `main.tsx`) + `useToast()`. Toasts non bloquants, bottom-center.
- `CommandPalette.tsx` — palette ⌘K (ouverte aussi via `openCommandPalette()` / event `lic:open-search`), résultats talents+projets cliquables.
- `PageTransition.tsx` — transition de route (utilisée avec `<AnimatePresence mode="wait">` dans les deux layouts, keyée par `pathname`).
- `Skeleton.tsx` — `Skeleton` + hook `useBriefLoading(ms)` (états de chargement Dashboard/Search).

⚠️ **Animations & onglet en arrière-plan** : framer-motion gèle les animations d'apparition (`opacity 0→1`) quand l'onglet est masqué (rAF throttlé) → contenu invisible. Tous les composants animés au montage (`PageTransition`, `Reveal` du pitch, `CommandPalette`, `Toast`, `CountUp`) utilisent un garde `document.visibilityState === 'visible'` : `initial={false}` si masqué → rendu direct à l'état final. Pour screenshoter un changement d'état (palette/toast) dans le preview headless, déclencher l'action puis `preview_resize` (force le repaint) avant `preview_screenshot`.

## Selection console & role review (Les Ombres de Midi)

- `data/selection.ts` — store localStorage-backed (`useSyncExternalStore`) des candidats par rôle.
  `CandidateStatus` inclut **`new`** (soumissions fraîches, pas encore notées) en plus du pipeline
  `no-go → shortlisted → callback → offer → cast` (label affiché du statut `no-go` : **"Reviewed"**,
  pas "No Go" — il regroupe tous les profils dont la vidéo a été revue mais pas promue). `LOCKED_COLUMNS`
  (= `{new}`) empêche le drag hors de cette colonne dans `SelectionConsole` — il faut noter le candidat
  (via `RoleReview`) pour qu'il en sorte (`rateCandidate` le bascule alors automatiquement vers
  `no-go`/`shortlisted` selon le score). Chaque candidat porte aussi des critères de fiche talent
  (`gender`, `experienceLevel`, `nationality`, `languages`) et `raterVotes` (vote individuel par membre
  de l'équipe, `team member id → signal`) — source unique pour les bulles "other ratings"
  (`deriveTeamRatings()`) et pour le filtre "Reviewed by". `useCandidatesForRoles(roleIds)` alimente une
  vue multi-rôles (tout le projet) sans appeler de hooks dans une boucle.
- `data/savedSearches.ts` — playlists de recherche multi-critères (localStorage), CRUD `saveSearch` /
  `deleteSearch` / `useSavedSearches(projectId)`. Le type `SavedSearchFilters` est la shape exacte de
  l'état de filtres de `SelectionConsole`.
- `studio/SelectionConsole.tsx` — **vue projet entière** (toutes les colonnes, tous les rôles), plus
  une fiche projet en tête (poster, synopsis, compteurs roles/submissions/shortlist/booked calculés en
  direct depuis les candidats) et une barre de recherche multi-critères (`FilterBar` : rôle, note
  good/maybe/no, score pondéré min/max, revu par, critères talent — genre/expérience/nationalité/langue
  —, champ texte libre) avec **Save search** → playlist et menu **Playlists** pour recharger/supprimer
  une recherche sauvegardée. Sous la barre de filtres : un **toolbar de vue** (`ViewTab` Kanban / List /
  Wall) + le bouton **Select multiple** (caché en vue Wall) → sélection multi-cartes + barre flottante en
  bas (Change status / Send a message, modales via `EditModal`).
  - **Kanban** (par défaut) : colonnes teintées (`COLUMN_TONE` : New gris, Offer vert, Cast jaune ;
    "Reviewed" reste neutre), bulles de review collective en bas à droite des cartes. Chaque en-tête de
    colonne a, en plus du compteur : un bouton **Select all** dans la colonne (visible seulement en mode
    sélection — `selectMany()`), un bouton **Watch** (ouvre `WatchModal` sur tous les candidats de cette
    colonne) et le bouton liste qui bascule en vue **List** filtrée sur cette seule colonne
    (`columnFocus`, chip "Viewing: …" avec ✕ pour revenir à tout).
  - **List** (`ListView`) : une ligne par candidat — photo, rôle (gras, au-dessus du nom), petits carrés
    colorés avec initiales par membre d'équipe (`deriveTeamRatings`), score pondéré, **statut éditable**
    (`StatusEditor`, dropdown → `moveCandidate`), et un bouton **Watch** par ligne. En tête de liste :
    **Select all** (mode sélection) + bouton **Watch** global pour toute la liste affichée.
  - **Wall** (`WallView`, repris de `studio/Wall.tsx`) : une carte par rôle avec la photo du profil
    retenu (Offer/Cast) ou un bouton **Select** qui bascule en List pré-filtrée sur ce rôle pour choisir.
  - **`WatchModal`** : pop-up plein-écran (clic en dehors = fermeture, retour à la vue d'origine) qui
    réutilise le lecteur `Player` de `Review.tsx` pour défiler les vidéos d'une liste de candidats
    (précédent/suivant) avec les 3 boutons de notation (No go / Maybe / Good match → `rateCandidate`)
    directement dans la pop-up.
  La flèche retour remonte toujours au Dashboard du projet (jamais à une fiche review). Le paramètre
  `?role=` (lien depuis Dashboard/Wall/RoleReview) pré-remplit juste le filtre rôle — il ne restreint
  plus la vue à un seul rôle.
- `studio/RoleReview.tsx` — fiche de review d'un candidat (même structure que la review Evermore dans
  `Review.tsx` : rating + étoiles, other ratings, AI scene analysis, feedback direct à l'acteur) avec un
  compteur **XX / YY** (position dans la file de candidats du rôle) à côté de la nav précédent/suivant.

## Conventions

- Alias d'import **`@/`** → `src/` (configuré dans `vite.config.ts` + `tsconfig.json`).
- Composants en PascalCase, un dossier par surface (`studio/`, `app/`).
- Préférer les classes Tailwind ; n'utiliser `tokens.ts` que là où une valeur brute est requise (recharts, SVG inline…).
- Médias / vidéos factices : à placer dans `public/` (assets sources disponibles dans le repo voisin `LetitCast/assets`).

## État d'avancement

✅ **Socle** : stack, design system, composants, routing, cadre téléphone.
✅ **Données** : fixtures réelles de l'annexe dans `src/data/` (talents, équipe, projets/rôles, auditions, feed, sides, scene analysis, search, discover).
✅ **Studio** (`/studio/*`) : Home/Feed, Dashboard "Wall", Talent Recruiter (search), LIC Player (review).
✅ **Talent** (`/app/*`) : Discover, Casting detail, Self-tape (webcam réelle + fallback), Auditions, Profile.
✅ **Pitch** (`/pitch`) : landing scroll-driven (progress bar, reveals, compteurs animés, Skip intro, CTA → /studio & /app).
✅ **Finition** : transitions de page, toasts, palette ⌘K, skeletons, micro-interactions, tour complet sans bouton mort.

App complète et navigable de bout en bout : `/pitch → /studio (feed→dashboard→review→search) → /app (discover→casting→selftape→auditions→profile)`.
