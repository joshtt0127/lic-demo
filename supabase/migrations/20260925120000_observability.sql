-- Savoir quand ça casse.
--
-- Jusqu'ici, une panne se découvrait par un utilisateur qui écrit — ou pas du
-- tout. Pas de suivi d'erreurs, pas d'alerte, aucun endroit où regarder. C'est
-- le dernier point rouge de l'audit, et le plus coûteux : un produit qu'on ne
-- peut pas observer est un produit qu'on répare toujours en retard.
--
-- Pas de fournisseur tiers ici, et c'est un choix : le produit a déjà une base
-- de données, une console d'exploitation et des rôles. Ajouter un service
-- externe demanderait un compte, une clé, un contrat de sous-traitance et une
-- annexe RGPD de plus — pour un besoin que quinze lignes de SQL couvrent au
-- stade MVP. Le jour où le volume l'exige, cette table se rebranche sur un
-- collecteur sans rien changer au reste.
--
-- Ce qu'on **ne** journalise **pas** : le contenu. Pas de corps de message, pas
-- de note interne, pas de donnée de profil. Un message d'erreur, une route, un
-- navigateur, et l'identifiant de la personne pour pouvoir recouper. Un journal
-- d'incidents qui fuite des données devient lui-même l'incident.

create table if not exists public.client_errors (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  profile_id  uuid references public.profiles (id) on delete set null,
  /** `render` (React), `promise` (rejet non capturé), `window` (erreur globale). */
  kind        text not null,
  message     text not null,
  /** Tronquée : on cherche l'endroit, pas à rejouer la pile entière. */
  stack       text,
  route       text,
  user_agent  text,
  release     text
);

comment on table public.client_errors is
  'Erreurs remontées par le navigateur. Aucun contenu utilisateur : message, route, navigateur.';

create index if not exists client_errors_recent_idx on public.client_errors (occurred_at desc);

alter table public.client_errors enable row level security;

-- Tout le monde écrit son propre incident ; seuls le support et l'admin lisent.
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to authenticated, anon
  with check (true);

drop policy if exists client_errors_read on public.client_errors;
create policy client_errors_read on public.client_errors
  for select to authenticated
  using (public.is_lic_support());

-- ── L'état de santé, en une requête ───────────────────────────────────────

/**
 * Ce qui va mal en ce moment, vu du produit.
 *
 * Volontairement une poignée de compteurs plutôt qu'un tableau de bord : ce sont
 * les quatre choses qui, si elles dérivent, veulent dire qu'un parcours critique
 * est cassé — des e-mails qui ne partent pas, des analyses qui échouent, des
 * analyses qui ne finissent jamais, des erreurs qui montent.
 */
create or replace view public.v_ops_health
with (security_invoker = true) as
  select
    (select count(*) from public.email_outbox
      where status in ('failed', 'skipped') and created_at > now() - interval '24 hours')
      as emails_not_sent_24h,
    (select count(*) from public.email_outbox
      where status = 'queued' and created_at < now() - interval '1 hour')
      as emails_stuck,
    (select count(*) from public.tape_ai_reviews
      where status = 'failed' and created_at > now() - interval '24 hours')
      as ai_failures_24h,
    (select count(*) from public.tape_ai_reviews
      where status = 'pending' and created_at < now() - interval '1 hour')
      as ai_stuck,
    (select count(*) from public.client_errors
      where occurred_at > now() - interval '24 hours')
      as client_errors_24h,
    (select count(*) from public.reports where status = 'open') as reports_open,
    (select count(*) from public.deletion_requests where completed_at is null)
      as deletions_pending;

comment on view public.v_ops_health is
  'Les quelques compteurs qui disent qu''un parcours critique est cassé.';

revoke all on public.v_ops_health from anon, public;
grant select on public.v_ops_health to authenticated;
