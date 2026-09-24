-- Ce qui se passe quand une annonce change, et quand elle se ferme.
--
-- Deux trous qui se ressemblent : dans les deux cas, des gens qui ont candidaté
-- ne sont au courant de rien.
--
-- **Une annonce modifiée après réception de candidatures.** La date limite
-- avance de trois jours, le lieu de tournage change, les consignes de tape sont
-- réécrites — et personne ne le sait. Le comédien prépare une tape pour une
-- consigne qui n'existe plus.
--
-- Toutes les modifications ne se valent pas. Corriger une faute dans le
-- synopsis ne mérite pas une alerte à quarante personnes ; changer la date
-- limite, si. On sépare donc les deux :
--   · **date limite, lieu, consignes de tape** → fait **et** notification ;
--   · le reste → fait seulement, l'histoire reste complète sans réveiller
--     personne.
--
-- **Une annonce fermée.** Les candidatures en cours restaient telles quelles,
-- pour toujours : « en cours d'examen » sur un casting terminé depuis six mois.
-- C'est la pire expérience du produit côté comédien — l'absence de réponse,
-- déguisée en attente. À la fermeture, ce qui n'a pas été tranché devient « non
-- retenu », chaque candidature produit son fait et sa notification, et le
-- comédien sait où il en est.
--
-- Ce que ça ne fait pas : toucher aux candidatures déjà réglées (retenu,
-- retiré, non retenu), ni supprimer quoi que ce soit.

-- ── Une annonce qui change ────────────────────────────────────────────────

create or replace function public.record_casting_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed  text[] := '{}';
  v_notify   boolean := false;
  v_org      uuid;
  v_title    text;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Les mouvements de statut ont leur propre fait (publication, fermeture).
  if new.deadline_at is distinct from old.deadline_at then
    v_changed := v_changed || 'deadline_at';
    v_notify := true;
  end if;
  if new.location is distinct from old.location then
    v_changed := v_changed || 'location';
    v_notify := true;
  end if;
  if new.title is distinct from old.title then v_changed := v_changed || 'title'; end if;
  if new.description is distinct from old.description then v_changed := v_changed || 'description'; end if;
  if new.compensation is distinct from old.compensation then v_changed := v_changed || 'compensation'; end if;
  if new.visibility is distinct from old.visibility then v_changed := v_changed || 'visibility'; end if;

  if array_length(v_changed, 1) is null then
    return new;
  end if;

  select p.org_id into v_org from public.projects p where p.id = new.project_id;

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, before, after, metadata)
  values (
    'CASTING_UPDATED',
    auth.uid(),
    'casting_call',
    new.id,
    v_org,
    jsonb_build_object('deadline_at', old.deadline_at, 'location', old.location,
                       'title', old.title, 'visibility', old.visibility),
    jsonb_build_object('deadline_at', new.deadline_at, 'location', new.location,
                       'title', new.title, 'visibility', new.visibility),
    jsonb_build_object('changed', to_jsonb(v_changed), 'notified', v_notify)
  );

  -- On ne réveille que pour ce qui change le travail du comédien.
  if v_notify then
    v_title := coalesce(new.title, 'A casting');
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
    select distinct a.talent_id,
           'casting_updated',
           v_title || ' has changed',
           case
             when new.deadline_at is distinct from old.deadline_at then 'The deadline moved.'
             else 'The location changed.'
           end,
           'casting_call',
           new.id
      from public.applications a
      join public.roles r on r.id = a.role_id
     where r.casting_call_id = new.id
       and a.status not in ('withdrawn', 'not_selected', 'cast');
  end if;

  return new;
end;
$$;

revoke execute on function public.record_casting_update() from anon, authenticated, public;

drop trigger if exists casting_calls_record_update on public.casting_calls;
create trigger casting_calls_record_update
  after update on public.casting_calls
  for each row execute function public.record_casting_update();

/** Les consignes de tape d'un rôle : c'est le travail demandé, on prévient. */
create or replace function public.record_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.selftape_instructions is not distinct from old.selftape_instructions then
    return new;
  end if;

  v_org := public.casting_call_org_id(new.casting_call_id);

  insert into public.events (type, actor_id, entity_type, entity_id, org_id, before, after, metadata)
  values ('CASTING_UPDATED', auth.uid(), 'role', new.id, v_org,
          jsonb_build_object('selftape_instructions', old.selftape_instructions),
          jsonb_build_object('selftape_instructions', new.selftape_instructions),
          jsonb_build_object('changed', to_jsonb(array['selftape_instructions']), 'notified', true));

  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select a.talent_id,
         'casting_updated',
         'New self-tape instructions',
         coalesce(new.name, 'A role') || ' — the production updated what they want to see.',
         'role',
         new.id
    from public.applications a
   where a.role_id = new.id
     and a.status not in ('withdrawn', 'not_selected', 'cast');

  return new;
end;
$$;

revoke execute on function public.record_role_update() from anon, authenticated, public;

drop trigger if exists roles_record_update on public.roles;
create trigger roles_record_update
  after update on public.roles
  for each row execute function public.record_role_update();

-- ── Une annonce qui se ferme ──────────────────────────────────────────────

/**
 * Fermer un casting règle les candidatures restées en route.
 *
 * Chaque passage à `not_selected` traverse la machine à états comme n'importe
 * quel autre : son fait est écrit, sa notification part. On ne court-circuite
 * rien — c'est ce qui garantit que l'histoire reste vraie.
 */
create or replace function public.settle_applications_on_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status or new.status <> 'closed' then
    return new;
  end if;

  update public.applications a
     set status = 'not_selected',
         decided_at = coalesce(a.decided_at, now())
    from public.roles r
   where r.id = a.role_id
     and r.casting_call_id = new.id
     and a.status in ('submitted', 'viewed', 'under_review', 'shortlisted', 'callback', 'offer');

  return new;
end;
$$;

revoke execute on function public.settle_applications_on_close() from anon, authenticated, public;

drop trigger if exists casting_calls_settle_on_close on public.casting_calls;
create trigger casting_calls_settle_on_close
  after update of status on public.casting_calls
  for each row execute function public.settle_applications_on_close();
