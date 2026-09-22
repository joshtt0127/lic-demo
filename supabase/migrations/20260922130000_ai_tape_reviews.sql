-- L'avis de l'IA sur une self-tape.
--
-- Table séparée du contrôle technique (`tape_checks`) : l'un mesure des pixels,
-- l'autre donne un avis. Les mélanger ferait passer une règle arithmétique pour
-- une intelligence, ce que ce POC refuse.
--
-- Ce que l'IA reçoit : six images clés extraites de la tape, le rôle (nom,
-- description, consignes de self-tape), et les traits de jeu que la production
-- veut évaluer. Ce qu'elle rend : une note par trait **avec sa justification**,
-- une adéquation au rôle, des forces, des réserves. Rien n'est affiché sans sa
-- justification — un score seul n'aide personne à choisir un acteur.

create table if not exists public.tape_ai_reviews (
  id             uuid primary key default gen_random_uuid(),
  self_tape_id   uuid not null references public.self_tapes (id) on delete cascade,
  requested_by   uuid references public.profiles (id) on delete set null,
  -- pending → ready | failed
  status         text not null default 'pending',
  model          text,
  /** Les traits demandés par la production, dans l'ordre. */
  traits_asked   text[] not null default '{}',
  /** [{ trait, score, evidence }] — jamais un score sans sa raison. */
  traits         jsonb not null default '[]'::jsonb,
  fit_score      integer,
  summary        text,
  strengths      text[] not null default '{}',
  risks          text[] not null default '{}',
  frames         integer,
  error          text,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists tape_ai_reviews_tape_idx
  on public.tape_ai_reviews (self_tape_id, created_at desc);

alter table public.tape_ai_reviews enable row level security;

-- L'avis appartient à l'équipe qui review, pas au comédien : c'est une note
-- interne, comme les votes et les notes d'équipe.
create policy tape_ai_reviews_read on public.tape_ai_reviews
  for select to authenticated using (
    exists (
      select 1 from public.self_tapes st
       where st.id = tape_ai_reviews.self_tape_id
         and public.is_org_member(public.application_org_id(st.application_id))
    )
  );

-- Demander l'analyse est un acte de review : même droit que voter.
create policy tape_ai_reviews_insert on public.tape_ai_reviews
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.self_tapes st
       where st.id = tape_ai_reviews.self_tape_id
         and public.can_review_org(public.application_org_id(st.application_id))
    )
  );

-- Seule la fonction (service role) écrit le résultat ; le client ne fait que lire.
