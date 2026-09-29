-- TALENT GRAPH™ — la trajectoire d'un talent à travers les castings.
--
-- C'est la pièce que le mémo fondateur décrit comme « inestimable » : un
-- comédien auditionne pour quatre productions, décroche quatre callbacks
-- indépendants. Ça ne prouve pas qu'il convient à *votre* rôle. Ça prouve que
-- quatre équipes professionnelles distinctes ont jugé que cette présence
-- méritait un second regard. L'industrie laisse cette information s'évaporer.
--
-- Ce fichier revient sur une décision que j'avais prise dans l'autre sens.
-- La couche mémoire d'origine interdisait toute agrégation inter-productions,
-- par crainte du score universel. La crainte était juste ; la conclusion était
-- trop large. Ce qu'il faut interdire, ce n'est pas la mémoire partagée — c'est
-- de **la réduire à un nombre comparable**.
--
-- D'où trois règles, qui tiennent dans la forme même des données :
--
--   1. **Des faits comptés, jamais un score.** « 4 productions l'ont rappelé »
--      est un fait daté et vérifiable. « 87 % de potentiel » est un jugement
--      déguisé en mesure. On ne renvoie aucun agrégat pondéré, aucun total sur
--      100, rien qui se trie du meilleur au moins bon.
--
--   2. **Jamais l'identité des autres productions.** Un compte, pas une liste.
--      Savoir que trois équipes ont rappelé quelqu'un est une information de
--      casting ; savoir *lesquelles* est une information concurrentielle, et
--      elle ne nous appartient pas. C'est aussi ce qui rend le partage
--      acceptable pour les productions qui alimentent le graphe.
--
--   3. **Jamais visible du talent.** Un comédien qui verrait « 0 production ne
--      vous a rappelé » lirait un verdict sur sa carrière là où il n'y a qu'un
--      compteur. La fonction est fermée aux comptes non-production.
--
-- Et le graphe est **temporel**, parce que c'est tout l'intérêt : il ne fige
-- pas quelqu'un dans son passé. Écarté cette année, shortlisté l'an prochain,
-- casté ensuite — ce sont trois points d'une trajectoire, pas trois versions
-- contradictoires d'une même vérité. La fenêtre récente est donc séparée du
-- cumul, et la répartition par année est rendue telle quelle.

/**
 * La trajectoire de plusieurs talents, en un seul appel.
 *
 * En lot volontairement : le feed en a besoin pour trente candidatures à la
 * fois, et trente allers-retours transformeraient une idée juste en écran lent.
 *
 * `security definer` parce qu'il n'y a pas d'autre moyen : les policies de
 * `applications` ne montrent à une organisation que ses propres candidatures —
 * c'est exactement ce qu'on veut pour tout le reste du produit, et c'est ce qui
 * rend le calcul inter-productions impossible en `security_invoker`. Le garde
 * est donc explicite et unique : il faut être membre actif d'une organisation.
 */
create or replace function public.talent_graph(p_talents uuid[])
returns table (
  talent_id                uuid,
  /** Nombre de productions **distinctes**, jamais lesquelles. */
  productions_applied      integer,
  productions_shortlisted  integer,
  productions_callback     integer,
  productions_cast         integer,
  /** La même chose sur douze mois : une trajectoire récente, pas un cumul de carrière. */
  recent_applied           integer,
  recent_shortlisted       integer,
  recent_callback          integer,
  recent_cast              integer,
  auditions_total          integer,
  first_audition_at        timestamptz,
  last_activity_at         timestamptz,
  /** [{ year, applied, shortlisted, callbacks, cast }] — la trajectoire, sans lissage. */
  by_year                  jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Un comédien n'a pas accès au graphe, pas même au sien : ce sont les
  -- décisions d'autres équipes, et un compteur se lirait comme un verdict.
  if not exists (
    select 1 from public.organization_members m
     where m.profile_id = auth.uid() and m.status = 'active'
  ) then
    return;
  end if;

  return query
  with facts as (
    select
      a.talent_id                            as tid,
      p.org_id,
      a.created_at,
      coalesce(a.decided_at, a.created_at)   as at,
      a.status,
      a.status in ('shortlisted', 'callback', 'offer', 'cast') as reached_shortlist,
      a.status in ('callback', 'offer', 'cast')                as reached_callback,
      a.status = 'cast'                                        as reached_cast
    from public.applications a
    join public.roles r         on r.id = a.role_id
    join public.casting_calls c on c.id = r.casting_call_id
    join public.projects p      on p.id = c.project_id
    where a.talent_id = any (p_talents)
      and a.status not in ('draft', 'withdrawn')
  ),
  years as (
    select
      f.tid,
      jsonb_agg(
        jsonb_build_object(
          'year', f.yr,
          'applied', f.applied,
          'shortlisted', f.shortlisted,
          'callbacks', f.callbacks,
          'cast', f.casted
        ) order by f.yr
      ) as by_year
    from (
      select
        tid,
        extract(year from at)::int                              as yr,
        count(distinct org_id)                                  as applied,
        count(distinct org_id) filter (where reached_shortlist) as shortlisted,
        count(distinct org_id) filter (where reached_callback)  as callbacks,
        count(distinct org_id) filter (where reached_cast)      as casted
      from facts
      group by tid, extract(year from at)
    ) f
    group by f.tid
  )
  select
    f.tid,
    count(distinct f.org_id)::int,
    count(distinct f.org_id) filter (where f.reached_shortlist)::int,
    count(distinct f.org_id) filter (where f.reached_callback)::int,
    count(distinct f.org_id) filter (where f.reached_cast)::int,
    count(distinct f.org_id) filter (where f.at > now() - interval '12 months')::int,
    count(distinct f.org_id) filter (where f.reached_shortlist and f.at > now() - interval '12 months')::int,
    count(distinct f.org_id) filter (where f.reached_callback and f.at > now() - interval '12 months')::int,
    count(distinct f.org_id) filter (where f.reached_cast and f.at > now() - interval '12 months')::int,
    count(*)::int,
    min(f.created_at),
    max(f.at),
    coalesce(y.by_year, '[]'::jsonb)
  from facts f
  left join years y on y.tid = f.tid
  group by f.tid, y.by_year;
end;
$$;

comment on function public.talent_graph(uuid[]) is
  'Talent Graph™ — trajectoire inter-productions : des comptes datés, jamais un score, jamais l''identité des autres productions.';

revoke execute on function public.talent_graph(uuid[]) from anon, public;
grant execute on function public.talent_graph(uuid[]) to authenticated;

-- Le graphe balaie toutes les candidatures d'un talent, toutes organisations
-- confondues : sans cet index, chaque ouverture de feed ferait un parcours
-- complet de la table.
create index if not exists applications_talent_status_idx
  on public.applications (talent_id, status);
