-- Contatore mensile di chiamate a servizi esterni a pagamento (Google Places).
-- Serve per stare DENTRO la quota gratuita: quando il contatore del mese supera la
-- soglia, l'app torna automaticamente a OpenStreetMap (Nominatim/Overpass, gratis);
-- il mese dopo il periodo cambia, il contatore riparte da zero e si riusa Google.
--
-- Scritto SOLO dal server (service role) tramite la RPC atomica qui sotto: niente
-- policy di scrittura per anon/authenticated. Idempotente.

create table if not exists public.api_usage (
  service text not null,                    -- es. 'google_places'
  period  text not null,                    -- 'YYYY-MM' (mese di conteggio, UTC)
  count   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (service, period)
);

alter table public.api_usage enable row level security;
-- Nessuna policy: tabella accessibile solo via service role / RPC SECURITY DEFINER.

-- Prenota atomicamente UNA chiamata se siamo ancora sotto la soglia del mese.
-- Ritorna true  → slot prenotato: il chiamante PUÒ usare Google (conteggio incrementato).
-- Ritorna false → soglia raggiunta: il chiamante DEVE usare il fallback OSM.
-- L'upsert + il vincolo count < limit rendono l'operazione priva di race condition.
create or replace function public.reserve_api_call(p_service text, p_period text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  -- Upsert atomico: se la riga esiste già, incrementa SOLO finché siamo sotto la soglia.
  -- Quando la WHERE dell'ON CONFLICT è falsa (soglia raggiunta), l'UPDATE viene saltato e
  -- l'INSERT ... RETURNING non restituisce alcuna riga → v_new resta NULL → slot negato.
  insert into public.api_usage (service, period, count, updated_at)
    values (p_service, p_period, 1, now())
  on conflict (service, period) do update
    set count = public.api_usage.count + 1,
        updated_at = now()
    where public.api_usage.count < p_limit
  returning count into v_new;

  return v_new is not null;
end;
$$;

-- Solo il server (service role) può prenotare chiamate: niente accesso da client.
revoke all on function public.reserve_api_call(text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_api_call(text, text, integer) to service_role;
