-- Drink PROPRI del locale: ogni locale gestito può aggiungere i suoi drink (oltre a
-- quelli di sistema). Compaiono nella ricerca drink durante la live quando sei in quel
-- locale, così chi registra trova esattamente la carta del bar.
--
-- Lettura pubblica (devono apparire a tutti gli utenti in live).
-- Scrittura: solo il gestore APPROVATO di quel locale (riusa public.manages_venue).
-- Idempotente.

create table if not exists public.venue_drinks (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null,                 -- normalizePlaceKey(name): lower + spazi singoli
  name text not null,                      -- nome completo (es. "IPA della Casa 0,4L")
  abv numeric not null default 0,          -- gradazione %
  units numeric not null default 0,        -- Unità Alcoliche stimate
  label text,                              -- etichetta breve con emoji (es. "🍺 IPA Casa")
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.venue_drinks enable row level security;
create index if not exists venue_drinks_key_idx on public.venue_drinks(venue_key);

drop policy if exists "venue_drinks: lettura pubblica" on public.venue_drinks;
create policy "venue_drinks: lettura pubblica" on public.venue_drinks
  for select using (true);

drop policy if exists "venue_drinks: gestore insert" on public.venue_drinks;
create policy "venue_drinks: gestore insert" on public.venue_drinks
  for insert with check (public.manages_venue(venue_key));

drop policy if exists "venue_drinks: gestore update" on public.venue_drinks;
create policy "venue_drinks: gestore update" on public.venue_drinks
  for update using (public.manages_venue(venue_key)) with check (public.manages_venue(venue_key));

drop policy if exists "venue_drinks: gestore delete" on public.venue_drinks;
create policy "venue_drinks: gestore delete" on public.venue_drinks
  for delete using (public.manages_venue(venue_key));
