# Déploiement, migrations, restauration

Ce qui existe aujourd'hui, ce qui manque, et comment faire — sans supposition.

## Environnements

| | État |
| --- | --- |
| **Développement** | Local (`npm run dev`, port 5180) contre le projet Supabase `njnlyfwvqcbvvpjgwefz`. |
| **Préproduction** | ❌ **N'existe pas.** |
| **Production** | Vercel (`lic-demo-omega.vercel.app`) contre le **même** projet Supabase. |

⚠️ **Le développement et la production partagent la même base.** C'est le risque
d'exploitation le plus élevé du projet : une migration part directement en
production, sans répétition, et les tests E2E créent de vrais comptes dans la
base qui sert les vrais utilisateurs.

⚠️ **La suite E2E ne s'enchaîne pas deux fois de suite.** Chaque test crée de
vrais comptes, et Supabase Auth plafonne les créations par heure. Enchaîner un
fichier puis la suite complète fait échouer une douzaine de tests par timeout,
avec des fichiers à quinze minutes — et ça ressemble trait pour trait à une
régression qu'on vient d'introduire. Avant de partir en chasse : rejouer les
tests en échec **isolément**. S'ils passent, c'est le plafond, pas le code.

**Ce qu'il faut pour y remédier** (décision LIC, pas technique) : un second
projet Supabase. Une fois créé :

1. copier `.env.local` en `.env.staging` avec l'URL et les clés du nouveau projet ;
2. `SUPABASE_ENV=staging node scripts/db.mjs push` pour y rejouer **toutes** les
   migrations depuis l'origine — c'est la répétition qui manque aujourd'hui ;
3. pointer la CI E2E dessus (le workflow est prêt, il ne lui manque que les
   secrets) ;
4. brancher un déploiement de préproduction Vercel sur la branche de travail.

## Migrations

Un fichier par changement, horodaté, dans `supabase/migrations/`. Le runner
(`scripts/db.mjs`) applique chaque fichier **dans une transaction** et tient son
historique dans le schéma `private`, hors de portée de l'API.

```bash
node scripts/db.mjs status   # ce qui est appliqué, ce qui attend
node scripts/db.mjs push     # applique ce qui manque
node scripts/db.mjs query "select 1"
```

Règles tenues jusqu'ici, et à tenir :

- **on ne modifie jamais une migration déjà appliquée** — on en écrit une autre ;
- **aucune destruction silencieuse** : pas de `drop column`, pas de valeur d'enum
  retirée. Les valeurs remplacées (`casting_director`, `private`) sont converties
  et conservées pour les lignes historiques ;
- une migration qui devrait détruire des données **s'arrête et se discute**.

## Déploiement

```bash
npm run build                 # doit passer avant tout
npx vercel deploy --prod --yes --token <token> --scope joshtt0127s-projects
```

Le jeton Vercel et le jeton Supabase (`~/.supabase-token`) ne sont pas dans le
dépôt et ne doivent jamais y entrer. `.vercelignore` exclut `.env*`, `supabase/`,
`scripts/` et `e2e/` du paquet déployé.

## Retour en arrière

- **Front** : `npx vercel rollback <url-du-déploiement-précédent>` — instantané,
  le front est sans état.
- **Base** : il n'y a pas de « down » automatique. Une migration qui pose
  problème se corrige **par une migration suivante**, comme
  `20260924112100_drop_redundant_application_index.sql` l'a fait. C'est plus lent
  qu'un rollback et beaucoup plus sûr qu'un script inverse écrit dans l'urgence.

## Sauvegarde et restauration

Supabase prend une sauvegarde quotidienne du projet. La restauration point-in-time
demande un plan payant.

⚠️ **La restauration n'a jamais été testée sur ce projet.** Une sauvegarde qu'on
n'a pas restaurée au moins une fois n'est pas une sauvegarde — c'est une
intention. À faire dès qu'un projet de préproduction existe : y restaurer une
sauvegarde de production et vérifier que l'app démarre dessus.

## Observabilité

- `/admin` → onglet **Health** : e-mails non partis, analyses en échec ou
  bloquées, erreurs navigateur, signalements ouverts, effacements à terminer.
- `client_errors` recueille les erreurs de rendu et les promesses non capturées
  **sans aucun contenu utilisateur** — message, route, navigateur.
- Il n'y a **pas d'alerte** : quelqu'un doit regarder l'écran. Brancher une
  alerte (e-mail ou webhook) sur `v_ops_health` est le prochain pas, et il
  demande le SMTP qui manque encore.
