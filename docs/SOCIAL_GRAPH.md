# Graphe social — architecture technique

> Let It Cast · Postgres (Supabase) + React Query
> Migration : `supabase/migrations/20260922110000_social_graph.sql`

## 1. Le modèle

Deux liens, parce que la place de marché a deux natures d'acteurs : des
**personnes** et des **organisations** (maisons de production).

```sql
-- Une personne suit une personne (comédien ↔ comédien, comédien → directeur de casting)
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

-- Une personne suit une organisation
create table public.organization_follows (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, org_id)
);
create index organization_follows_org_idx on public.organization_follows (org_id);
```

Trois décisions sont dans ces vingt lignes :

| Décision | Pourquoi |
| --- | --- |
| Clé primaire composite | Suivre deux fois est impossible au niveau du schéma, pas au niveau de l'UI. |
| `on delete cascade` | Un compte supprimé ne laisse pas d'abonnés fantômes. |
| `check (follower_id <> following_id)` | On ne se suit pas soi-même — refusé par la base, pas seulement caché par le bouton. |

## 2. Les compteurs ne sont pas stockés

```sql
create view public.v_profile_network
with (security_invoker = true) as
select p.id as profile_id,
       (select count(*) from public.follows f where f.following_id = p.id) as followers,
       (select count(*) from public.follows f where f.follower_id  = p.id) as following,
       (select count(*) from public.organization_follows o where o.profile_id = p.id)
         as organizations_followed
  from public.profiles p;
```

Une colonne `followers_count` dénormalisée finit **toujours** par mentir : une
suppression en cascade, un rollback, un trigger oublié, et le nombre affiché ne
correspond plus aux lignes. Ici le compteur *est* la requête.

`security_invoker = true` : la vue s'exécute avec les droits de l'appelant, donc
elle ne contourne pas les règles ci-dessous.

## 3. Les règles d'accès (RLS)

```sql
alter table public.follows              enable row level security;
alter table public.organization_follows enable row level security;

-- Lecture : publique entre comptes connectés
create policy follows_read on public.follows
  for select to authenticated using (true);

-- Écriture : uniquement ses propres liens
create policy follows_write on public.follows
  for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());
```

(Les deux mêmes politiques existent sur `organization_follows`, avec
`profile_id = auth.uid()`.)

**Lecture publique assumée** : c'est ce qui rend un nombre d'abonnés
*vérifiable* plutôt que déclaratif. N'importe quel compte connecté peut
recompter. **Écriture strictement personnelle** : personne ne peut vous faire
suivre quelqu'un, ni vous désabonner.

## 4. Suivre produit un effet, sinon c'est une décoration

Deux triggers `security definer` écrivent dans le système de notifications
existant — donc, mécaniquement, dans la file d'e-mails sortants.

```sql
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_new_follower();

create trigger organization_follows_notify
  after insert on public.organization_follows
  for each row execute function public.notify_org_follower();
```

- `notify_new_follower` → une notification à la personne suivie.
- `notify_org_follower` → une notification à **chaque membre actif** de
  l'organisation suivie.

Le nom affiché est résolu côté base (`talent_profiles.professional_name`, sinon
prénom + nom, sinon « Someone ») : le client n'a rien à composer.

Chaîne complète :

```
insert follows / organization_follows
   └─ trigger → notifications           (badge + écran Notifications, en direct via Realtime)
        └─ trigger → email_outbox       (e-mail, dès qu'un SMTP est configuré)
```

## 5. La couche applicative

| Fichier | Rôle |
| --- | --- |
| `src/data/repositories/social.ts` | Les 7 accès à la base (compteurs, listes, follow/unfollow, comptage par organisation). Aucun composant ne parle à Supabase directement. |
| `src/features/social/queries.ts` | Les hooks React Query et l'invalidation : un follow invalide les 4 clés concernées, donc l'UI ne recalcule rien à la main. |
| `src/talent/feed/CastingPost.tsx` | Bouton Suivre + nombre d'abonnés dans l'en-tête de publication. |
| `src/talent/TalentHome.tsx` | Filtre **Following** du fil, carte « Votre réseau ». |

Le comptage des abonnés par organisation se fait **en une requête pour tout le
fil** (`organizationFollowerCounts(orgIds)`), pas une requête par publication.

## 6. Ce que le graphe social ne fait pas

- **Il ne remplace pas `saved_talents`.** Une production garde une liste de
  travail privée ; suivre est public et à l'initiative du comédien. Deux
  concepts, deux tables, pas de confusion.
- **Il ne classe pas le fil tout seul.** Le filtre *Following* est explicite :
  l'utilisateur choisit, l'algorithme ne décide pas à sa place.
- **Il ne stocke aucun compteur.**

## 7. Vérification

`e2e/social-graph.spec.ts`, joué contre la vraie base :

1. deux productions publient chacune un casting ;
2. le comédien ne suit personne → l'onglet *Following* est vide et le dit ;
3. il suit une production depuis sa publication → le bouton passe à *Following*,
   « 1 abonné » apparaît, et la ligne existe en base ;
4. l'onglet *Following* ne garde **que** cette production ;
5. la production reçoit sa notification (vérifié dans son écran) ;
6. se désabonner efface la ligne.
