-- Prezzi PARAMETRICI dei servizi locali: ogni servizio ha una config `pricing` (jsonb)
-- che descrive il modello (flat / per_day con sconti / audience a fasce). Modificabile da
-- admin, anche per singolo locale (override.pricing). default_price_cents resta come base/fallback.

alter table public.venue_service_types add column if not exists pricing jsonb;
alter table public.venue_service_overrides add column if not exists pricing jsonb;

-- Seed config di default per i 3 servizi base (prezzi in centesimi, modificabili da /admin).
update public.venue_service_types set pricing = jsonb_build_object(
  'model', 'flat',
  'base_cents', 2900,
  'spotlight_extra_cents', 1500
) where code = 'sponsored_event' and pricing is null;

update public.venue_service_types set pricing = jsonb_build_object(
  'model', 'per_day',
  'per_day_cents', 500,
  'durations', jsonb_build_array(3, 7, 14, 30),
  'position', jsonb_build_object('feed', 1, 'top', 1.6),
  'discounts', jsonb_build_array(
    jsonb_build_object('minDays', 7,  'pct', 10),
    jsonb_build_object('minDays', 14, 'pct', 15),
    jsonb_build_object('minDays', 30, 'pct', 25)
  )
) where code = 'promo' and pricing is null;

update public.venue_service_types set pricing = jsonb_build_object(
  'model', 'audience',
  'tiers', jsonb_build_object('venue', 1500, 'recent30', 2500, 'nearby', 4000, 'all', 9000),
  'nearby_km', 3
) where code = 'notify' and pricing is null;
