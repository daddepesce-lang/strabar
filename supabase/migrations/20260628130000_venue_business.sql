-- ============================================================================
-- Modulo "Area locali" (B2B): rivendicazione locale, catalogo servizi gestito da
-- admin (con prezzi/disponibilità anche PER-LOCALE), ordini a pagamento (Stripe),
-- eventi sponsorizzati. Tutto governato dal modello "richiesta → approvazione".
-- ============================================================================

-- 1) Rivendicazione/gestione di un locale --------------------------------------
create table if not exists public.venue_claims (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null,                 -- chiave normalizzata (lower, spazi singoli)
  venue_name text not null,                -- nome leggibile al momento della richiesta
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',  -- pending | approved | rejected
  note text,                               -- messaggio del richiedente
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists venue_claims_key_idx on public.venue_claims(venue_key);
create index if not exists venue_claims_user_idx on public.venue_claims(user_id);
-- Un solo claim attivo per (utente, locale): evita doppioni di richieste.
create unique index if not exists venue_claims_uniq on public.venue_claims(user_id, venue_key)
  where status in ('pending', 'approved');

alter table public.venue_claims enable row level security;
drop policy if exists "claims: leggo i miei" on public.venue_claims;
create policy "claims: leggo i miei" on public.venue_claims
  for select using (user_id = auth.uid());
drop policy if exists "claims: creo i miei (pending)" on public.venue_claims;
create policy "claims: creo i miei (pending)" on public.venue_claims
  for insert with check (user_id = auth.uid() and status = 'pending');
-- UPDATE/approvazione: solo service role (API admin). Nessuna policy.

-- È l'utente un gestore APPROVATO del locale? (usata da RPC e API) -------------
create or replace function public.is_venue_manager(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.venue_claims
    where user_id = p_user and venue_key = p_key and status = 'approved'
  );
$$;

-- 2) Catalogo SERVIZI (gestito da admin) --------------------------------------
create table if not exists public.venue_service_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,               -- 'sponsored_event' | 'promo' | 'notify' | custom
  name text not null,
  description text,
  default_price_cents integer not null default 0,
  currency text not null default 'eur',
  active boolean not null default true,    -- disponibile di default per tutti i locali
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.venue_service_types enable row level security;
drop policy if exists "servizi: lettura pubblica" on public.venue_service_types;
create policy "servizi: lettura pubblica" on public.venue_service_types
  for select using (true);
-- scrittura: solo service role (API admin)

-- Override PER-LOCALE di prezzo/disponibilità (prefe diverse per locale) -------
create table if not exists public.venue_service_overrides (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null,
  service_type_id uuid not null references public.venue_service_types(id) on delete cascade,
  price_cents integer,                     -- null = usa default_price_cents
  enabled boolean,                         -- null = usa active del catalogo
  created_at timestamptz not null default now(),
  unique (venue_key, service_type_id)
);
alter table public.venue_service_overrides enable row level security;
drop policy if exists "override: lettura pubblica" on public.venue_service_overrides;
create policy "override: lettura pubblica" on public.venue_service_overrides
  for select using (true);
-- scrittura: solo service role (API admin)

-- 3) Ordini (acquisti dei locali) ---------------------------------------------
create table if not exists public.venue_orders (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null,
  venue_name text,
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type_id uuid references public.venue_service_types(id) on delete set null,
  service_code text,
  status text not null default 'pending',  -- pending | paid | active | canceled | rejected
  amount_cents integer not null default 0,
  currency text not null default 'eur',
  stripe_session_id text,
  stripe_payment_intent text,
  ref_id text,                             -- id evento/banner collegato
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  activated_at timestamptz
);
create index if not exists venue_orders_key_idx on public.venue_orders(venue_key);
create index if not exists venue_orders_user_idx on public.venue_orders(user_id);
create index if not exists venue_orders_session_idx on public.venue_orders(stripe_session_id);

alter table public.venue_orders enable row level security;
drop policy if exists "ordini: leggo i miei" on public.venue_orders;
create policy "ordini: leggo i miei" on public.venue_orders
  for select using (user_id = auth.uid());
-- INSERT/UPDATE: solo service role (API checkout/webhook/admin)

-- 4) Eventi sponsorizzati ------------------------------------------------------
alter table public.events add column if not exists sponsored boolean not null default false;
alter table public.events add column if not exists sponsor_until timestamptz;
alter table public.events add column if not exists sponsor_venue_key text;

-- 5) Seed servizi base (prezzi modificabili da /admin) ------------------------
insert into public.venue_service_types (code, name, description, default_price_cents, sort) values
  ('sponsored_event', 'Evento sponsorizzato', 'Il tuo evento in cima alla lista con badge "Sponsorizzato".', 2900, 1),
  ('promo',           'Promo nel feed',       'Una promo del tuo locale mostrata nel feed degli utenti.',     1900, 2),
  ('notify',          'Notifica ai clienti',  'Avvisa chi ha già brindato nel tuo locale (es. serata/evento).', 1500, 3)
on conflict (code) do nothing;
