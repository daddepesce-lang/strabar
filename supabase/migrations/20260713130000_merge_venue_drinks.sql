-- FIX unione locali: la merge riscriveva SOLO location.name, ma nella dashboard admin un
-- locale viene aggregato anche dalle attribuzioni PER-DRINK (drinks[].place_name e
-- drinks[].added_places[].name). Risultato: dopo l'unione il doppione ricompariva nella
-- lista perché i suoi drink puntavano ancora al vecchio nome.
--
-- Questa versione riscrive TUTTE le occorrenze del vecchio nome (normalizzato = p_from_key):
--   1) location.name  (come prima, + tracciabilità in location.merged_from)
--   2) drinks[].place_name / place_key
--   3) drinks[].added_places[].name / key
-- così il vecchio locale sparisce del tutto dall'aggregazione.
--
-- Nota: è idempotente per il doppione. Se un'unione precedente aveva già riscritto
-- location.name (ma non i drink), rieseguire l'unione dal vecchio locale al locale di
-- destinazione ripulisce i drink rimasti indietro (lo step 1 aggiorna 0 righe, lo step 2 sì).

-- Normalizzazione condivisa (uguale a normalizePlaceKey lato client / norm() lato API).
create or replace function public.venue_key_norm(s text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(s, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.merge_venue_sessions(p_from_key text, p_to_name text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  m integer;
  p_to_key text := public.venue_key_norm(p_to_name);
begin
  -- 1) location.name → nome canonico (conserva l'originale in location.merged_from)
  update public.sessions
    set location = jsonb_set(
          jsonb_set(coalesce(location, '{}'::jsonb), '{merged_from}', to_jsonb(location->>'name'), true),
          '{name}', to_jsonb(p_to_name), true)
  where location->>'name' is not null
    and public.venue_key_norm(location->>'name') = p_from_key;
  get diagnostics n = row_count;

  -- 2) attribuzioni per-drink: place_name/place_key e added_places[].name/key.
  --    Ricostruisce l'array drinks preservando l'ordine, toccando solo le sessioni che
  --    contengono almeno un riferimento al vecchio locale.
  update public.sessions s
    set drinks = (
      select jsonb_agg(
        (
          -- place_name/place_key del drink
          case when public.venue_key_norm(d->>'place_name') = p_from_key
               then jsonb_set(jsonb_set(d, '{place_name}', to_jsonb(p_to_name), true), '{place_key}', to_jsonb(p_to_key), true)
               else d
          end
        )
        ||
        (
          -- added_places[]: rimpiazza name/key degli elementi che matchano
          case when jsonb_typeof(d->'added_places') = 'array'
               then jsonb_build_object('added_places', coalesce((
                      select jsonb_agg(
                        case when public.venue_key_norm(ap->>'name') = p_from_key
                             then jsonb_set(jsonb_set(ap, '{name}', to_jsonb(p_to_name), true), '{key}', to_jsonb(p_to_key), true)
                             else ap
                        end
                        order by ord2
                      )
                      from jsonb_array_elements(d->'added_places') with ordinality as ape(ap, ord2)
                    ), '[]'::jsonb))
               else '{}'::jsonb
          end
        )
        order by ord
      )
      from jsonb_array_elements(s.drinks) with ordinality as de(d, ord)
    )
  where jsonb_typeof(s.drinks) = 'array'
    and exists (
      select 1 from jsonb_array_elements(s.drinks) d
      where public.venue_key_norm(d->>'place_name') = p_from_key
         or exists (
              select 1 from jsonb_array_elements(coalesce(d->'added_places', '[]'::jsonb)) ap
              where public.venue_key_norm(ap->>'name') = p_from_key
            )
    );
  get diagnostics m = row_count;

  -- Ritorna il totale di sessioni toccate (nome sessione + attribuzioni per-drink).
  return coalesce(n, 0) + coalesce(m, 0);
end;
$$;
revoke all on function public.merge_venue_sessions(text, text) from public, anon, authenticated;
