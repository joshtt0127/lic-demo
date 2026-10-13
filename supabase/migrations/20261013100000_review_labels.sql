-- Audition Review Queue™ — Evaluate & Label.
--
-- Des étiquettes d'équipe posées sur une audition (« Strong on camera »,
-- « Accent to check »…), en plus du vote. Elles appartiennent à
-- l'organisation : mêmes règles que les votes et les notes — lisibles par ses
-- membres, posées par ceux qui peuvent reviewer (pas un viewer), jamais
-- visibles du comédien.

create table public.review_labels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  tone        text not null default 'neutral'
              check (tone in ('neutral', 'good', 'maybe', 'no', 'gold', 'link')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Une étiquette par nom et par organisation, sans tenir compte de la casse.
create unique index review_labels_org_name on public.review_labels (org_id, lower(btrim(name)));

create table public.application_labels (
  application_id  uuid not null references public.applications (id) on delete cascade,
  label_id        uuid not null references public.review_labels (id) on delete cascade,
  added_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  primary key (application_id, label_id)
);

create index application_labels_label on public.application_labels (label_id);

alter table public.review_labels enable row level security;
alter table public.application_labels enable row level security;

create policy review_labels_read on public.review_labels
  for select to authenticated using (public.is_org_member(org_id));

create policy review_labels_insert on public.review_labels
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_review_org(org_id));

create policy review_labels_update on public.review_labels
  for update to authenticated
  using (public.can_review_org(org_id))
  with check (public.can_review_org(org_id));

-- Supprimer une étiquette la retire de toutes les auditions : réservé à qui
-- l'a créée, ou à qui dirige le casting.
create policy review_labels_delete on public.review_labels
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.org_role_of(org_id) in ('owner', 'admin', 'casting_director')
  );

create policy application_labels_read on public.application_labels
  for select to authenticated
  using (public.is_org_member(public.application_org_id(application_id)));

-- L'étiquette doit appartenir à l'organisation qui reçoit la candidature :
-- impossible de poser l'étiquette d'une équipe sur l'audition d'une autre.
create policy application_labels_insert on public.application_labels
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.can_review_org(public.application_org_id(application_id))
    and exists (
      select 1 from public.review_labels label
      where label.id = label_id
        and label.org_id = public.application_org_id(application_id)
    )
  );

create policy application_labels_delete on public.application_labels
  for delete to authenticated
  using (public.can_review_org(public.application_org_id(application_id)));

grant select, insert, update, delete on public.review_labels to authenticated;
grant select, insert, delete on public.application_labels to authenticated;
