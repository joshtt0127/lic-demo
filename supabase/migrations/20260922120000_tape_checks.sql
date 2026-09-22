-- Contrôle technique d'une self-tape.
--
-- Ce qui est mesuré ici est *mesurable* : cadrage, définition, durée, son,
-- luminosité. Pas de jugement de jeu — ça, c'est la couche IA, qui viendra avec
-- sa clé et écrira dans sa propre table. Mélanger les deux ferait passer une
-- règle arithmétique pour un avis, ce qui est exactement ce que ce POC refuse.
--
-- L'analyse est faite dans le navigateur qui possède déjà le fichier (celui du
-- comédien, au moment de l'envoi) : aucune transcodage serveur, aucun coût.

create table if not exists public.tape_checks (
  self_tape_id uuid primary key references public.self_tapes (id) on delete cascade,
  duration_s   numeric(8, 2),
  width        integer,
  height       integer,
  -- portrait | landscape | square
  framing      text,
  -- Luminance moyenne de quelques images, 0 (noir) à 1 (blanc).
  brightness   numeric(4, 3),
  -- null quand le navigateur ne sait pas répondre : on ne devine pas.
  has_audio    boolean,
  bytes        bigint,
  /** Une entrée par règle : { key, ok, detail } — l'UI n'invente aucun libellé. */
  checks       jsonb not null default '[]'::jsonb,
  score        integer,
  created_at   timestamptz not null default now()
);

alter table public.tape_checks enable row level security;

-- Se lit exactement comme la tape à laquelle il appartient.
create policy tape_checks_read on public.tape_checks
  for select to authenticated using (
    exists (
      select 1 from public.self_tapes st
       where st.id = tape_checks.self_tape_id
         and (
           public.application_talent_id(st.application_id) = auth.uid()
           or public.is_org_member(public.application_org_id(st.application_id))
         )
    )
  );

-- Écrit par le comédien au moment de l'envoi.
create policy tape_checks_write on public.tape_checks
  for all to authenticated
  using (
    exists (
      select 1 from public.self_tapes st
       where st.id = tape_checks.self_tape_id
         and public.application_talent_id(st.application_id) = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.self_tapes st
       where st.id = tape_checks.self_tape_id
         and public.application_talent_id(st.application_id) = auth.uid()
    )
  );
