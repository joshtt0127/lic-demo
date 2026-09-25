# L'architecture d'intelligence

> **On n'automatise pas le jugement. On optimise l'attention.**

Une équipe de casting ne souffre pas d'un manque d'avis : elle souffre d'une
file. Cent candidatures arrivent, trente sont ouvertes, et celles qui comptent
se perdent non pas parce que personne ne sait juger, mais parce que personne
n'arrive jusqu'à elles. C'est ce problème-là que cette couche traite — pas
celui de savoir qui est le meilleur.

## La chaîne

```
Workflow  →  Signal  →  Mémoire  →  Contexte  →  Feed d'attention  →  Décision humaine
(ce qui    (le fait   (ce qu'une   (le rythme   (trois bandes +      (votes, notes,
 se passe)  daté)      prod se      réel de      leurs raisons)       distribution)
                       rappelle)    l'équipe)
```

Chaque flèche est une transformation, et chaque étape existe déjà quelque part
dans le produit. Rien n'a été empilé à côté.

## Ce qui n'a pas été créé, et pourquoi

Le brief citait six concepts. Ça n'en fait pas six tables.

| Tentation | Ce qui a été fait à la place |
| --- | --- |
| Une table `signals` | `events` en est déjà une : 15 types, acteur, sujet, organisation, horodatage. Deux magasins = deux vérités qui divergent au premier bug. |
| Des tables `talent_graph` / `production_graph` | Deux **vues**. Une table de synthèse serait fausse dès qu'un événement arrive en retard, qu'un compte est anonymisé ou qu'une candidature est retirée. |
| Un `score` par candidat | Trois bandes et des raisons. Voir plus bas. |
| Un appel de modèle par candidature | Du SQL déterministe. Deux exécutions sur les mêmes faits donnent le même résultat — la condition pour qu'une équipe puisse contester ce qu'elle voit. |

## 1. Signal — `20260925130000_intelligence_signals.sql`

Ce qui manquait n'était pas un stockage, c'était **l'attention**. Ouvrir une
fiche, regarder une tape en entier, y revenir : ces gestes disent où va
l'attention d'une équipe et ne laissaient aucune trace. `markViewed` ne disait
qu'une chose, une seule fois, et ne distinguait pas un coup d'œil de trois
visionnages complets.

- `record_review_engagement(application, kind, progress)` — `AUDITION_OPENED`,
  `AUDITION_VIEWED`, `AUDITION_COMPLETED`, `AUDITION_REWATCHED`.
- `record_profile_view(talent)` — le sourcing depuis l'annuaire production.

Les deux vérifient l'appartenance à l'organisation. Sans ce garde, n'importe qui
pourrait **fabriquer de l'attention**, et de l'attention fabriquée empoisonne la
mémoire de tout le monde.

`v_casting_signals` replace chaque fait dans son contexte complet : **talent ×
rôle × casting × production × temps**. C'est l'unité de compréhension du
produit. Un PASS n'est pas un jugement universel, c'est un non pour *ce* rôle,
*ce* jour-là — et cette vue rend la règle structurelle au lieu de déclarative.

## 2. Mémoire — `20260925131000_intelligence_memory.sql`

**`v_talent_memory`** — ce qu'une organisation se rappelle d'un comédien :
combien de fois elle l'a vu, retenu, rappelé, distribué, écarté, et quand.

**`v_production_memory`** — le comportement observé d'une équipe : sa couverture
de revue, ses délais médians, ce qu'elle retient par type de rôle.

### La décision qui compte : le cloisonnement

**Rien n'agrège le comportement de plusieurs productions sur un même comédien.**

C'était trivial à écrire, et ce serait exactement le score universel que le
produit refuse. « Retenu par 4 productions » deviendrait en une semaine le tri
par défaut de tout le monde : un classement d'êtres humains, écrit par accident,
avec la mise en page d'une statistique neutre.

Ce n'est pas un filtre qu'un futur développeur peut oublier de mettre. Les vues
sont en `security_invoker` : le cloisonnement est **la seule chose que la base
accepte de répondre**.

### La fuite refermée dans la même migration

Capturer l'attention crée une donnée qui n'existait pas, et elle est sensible :
combien de fois une équipe a ouvert une tape, l'a regardée en entier, y est
revenue. C'est de la **délibération**.

La rendre lisible au comédien, ce serait rejouer le « vu à 21 h 14 » des
messageries sur une décision de carrière : une production hésiterait à revoir
une tape de peur du signal envoyé, un comédien lirait un rappel dans un clic.

La policy de `events` exclut donc ces types pour le sujet — et `export_my_data()`
aussi, qui tourne pourtant en `security definer`. Les deux sont testés.

## 3. Contexte — dans le moteur

Le contexte n'est pas une table : c'est ce qui rend un seuil relatif. « Ça
traîne » vaut `stale_multiplier × le délai médian de décision de cette
production`, avec un plancher pour les équipes trop jeunes pour avoir une
médiane. Sans cette calibration, le feed dirait la même chose à une équipe qui
décide en 48 h et à une qui met trois semaines — donc rien à personne.

## 4. Feed d'attention — `20260925132000_intelligence_engine.sql`

### Ce que le moteur ne fait pas

Pas de score de talent. Pas de pourcentage de correspondance. Pas de tri du
meilleur au moins bon. Pas de notation du physique, de l'âge ou de la
personnalité. Pas de décision de distribution.

Un `score numeric` aurait été plus court à écrire, plus facile à trier et plus
vendeur en démo. C'est précisément le problème : **un pourcentage se compare, et
dès qu'il se compare il devient un classement d'êtres humains avec l'autorité
tranquille d'un chiffre.**

### Les trois bandes

| Bande | Ce qu'elle contient | Pourquoi elle existe |
| --- | --- | --- |
| **Priority review** | L'équipe s'est déjà engagée (vote, visionnage complet, retour sur la tape), la production connaît déjà ce comédien, la deadline approche, ou ça traîne par rapport à son rythme | Ce qui attend une décision |
| **Discovery** | Dossiers complets de gens que cette production n'a jamais revus, que personne n'a encore ouverts | La mémoire, laissée seule, se referme sur les visages connus. C'est la seule bande qui corrige un effet du produit lui-même |
| **All applicants** | Tout le reste | **Aucune candidature n'est jamais masquée.** Le produit hiérarchise l'attention, il ne filtre pas l'accès |

### L'ordre à l'intérieur d'une bande

Deadline d'abord — c'est la seule contrainte qu'on ne rattrape pas —, puis
l'attente : qui n'a pas de réponse depuis le plus longtemps.

C'est un tri **sur des délais**. Rien dans l'ordonnancement ne lit un attribut
du comédien, et deux candidatures équivalentes ressortent dans l'ordre où elles
sont arrivées. Le moteur range le travail, pas les gens.

### Les raisons

Chaque ligne porte ses raisons sous forme de `{ code, faits }`. La base ne
renvoie jamais de phrase : elle dit ce qui est vrai et avec quels nombres, et
c'est `src/features/intelligence/reasons.ts` qui rédige.

C'est la seule façon de garantir qu'une explication ne peut pas dire autre chose
que ce que la règle a fait. Pas de texte généré après coup pour habiller une
décision opaque : **la raison *est* la règle**. Si une règle ne peut pas se dire
avec ses chiffres, elle n'a rien à faire dans le feed.

> « Waiting 13 days — your team usually decides within 3 days »
> « A teammate voted and nobody has decided »
> « You cast this talent once before »
> « New to your team — you have never reviewed this talent »

### Versionnement

`intelligence_settings` porte les seuils **et** `engine_version`, que chaque
ligne du feed embarque. Sans elle, une équipe ne peut pas dire de quoi elle
conteste le résultat.

## 5. Décision humaine

Inchangée, et c'est le point. Les votes, les notes, les statuts, la
distribution : tout reste entre des mains humaines. Le feed change l'**ordre de
lecture**, jamais l'objet qu'on lit — même carte, même fiche, même bouton
Review.

Dans le même esprit, la lecture IA d'une tape est passée **après** le vote dans
la fiche de review : lire une note avant de juger, c'est se faire ancrer.

## Ce que ça garantit, et où c'est vérifié

`e2e/intelligence.spec.ts`, en API avec de vraies sessions et la clé publique —
une garantie qui ne tient qu'à un écran n'est pas une garantie.

1. La mémoire d'une production ne fuit pas vers une autre (demandée nommément).
2. Les gestes de revue ne remontent jamais au comédien — ni par la table, ni par
   l'export RGPD — et il ne peut pas en fabriquer sur son dossier.
3. Aucune candidature n'est masquée : le feed contient toutes les candidatures.
4. Un inconnu au dossier complet arrive en `discovery`, pas enterré.

`src/features/intelligence/reasons.test.ts` garde les explications : chaque
phrase contient encore ses nombres, et aucune ne qualifie une personne — un test
interdit explicitement le vocabulaire de classement (`best`, `top`, `strong`,
`match`, `score`, `rank`).

## Limites assumées

- **Le calcul est à la demande.** `intelligence_feed()` recalcule à chaque
  appel. C'est tenable au volume actuel et ça évite un cache qui mentirait ; à
  quelques milliers de candidatures par casting, il faudra une vue matérialisée
  rafraîchie par `pg_cron` — le contrat de la fonction ne changera pas.
- **La bande `priority` peut tout contenir** sur une base qui a pris du retard :
  si tout attend depuis dix jours, tout est urgent. C'est honnête, et l'ordre
  interne continue de faire le travail.
- **`never_opened` se replie sur `applications.viewed_at`** pour les
  candidatures antérieures à la couche signal, sinon elles se déclareraient
  toutes jamais ouvertes.
