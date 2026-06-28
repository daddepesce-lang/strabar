-- Registro CANONICO dei locali. Finora un "locale" era solo la stringa location.name
-- nelle sessioni (→ doppioni, niente verifica). Questa tabella dà un'entità governabile
-- da admin: verifica ufficiale e unificazione doppioni (con riscrittura retroattiva
-- delle sessioni). La chiave è la stessa normalizzazione usata ovunque (lower + spazi singoli).

create table if not exists public.venues (
  key text primary key,                  -- normalizePlaceKey(name)
  name text not null,                    -- nome canonico (display)
  address text,
  lat double precision,
  lng double precision,
  verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.venues enable row level security;
drop policy if exists "venues: lettura pubblica" on public.venues;
create policy "venues: lettura pubblica" on public.venues for select using (true);
-- scrittura: solo service role (API admin)

create index if not exists venues_verified_idx on public.venues(verified) where verified = true;

-- Unifica i DOPPIONI: tutte le sessioni il cui nome (normalizzato) è p_from_key
-- vengono riscritte con il nome canonico p_to_name. Conserva l'originale in
-- location.merged_from per tracciabilità. Restituisce il numero di sessioni aggiornate.
-- SECURITY DEFINER ma eseguibile SOLO dal service role (revoke su anon/authenticated):
-- viene chiamata dall'API admin, già protetta.
create or replace function public.merge_venue_sessions(p_from_key text, p_to_name text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.sessions
    set location = jsonb_set(
          jsonb_set(coalesce(location, '{}'::jsonb), '{merged_from}', to_jsonb(location->>'name'), true),
          '{name}', to_jsonb(p_to_name), true)
  where location->>'name' is not null
    and lower(regexp_replace(btrim(location->>'name'), '\s+', ' ', 'g')) = p_from_key;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.merge_venue_sessions(text, text) from public, anon, authenticated;
