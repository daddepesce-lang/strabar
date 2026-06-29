-- Banner promo "di proprietà": un gestore che compra una promo deve poterla ritrovare,
-- modificare, prorogare, eliminare e vederne le statistiche. Colleghiamo ogni banner al
-- locale, all'utente che l'ha comprato e all'ordine; aggiungiamo i contatori analytics.
alter table public.ad_banners add column if not exists venue_key text;
alter table public.ad_banners add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.ad_banners add column if not exists order_id uuid;
alter table public.ad_banners add column if not exists impressions integer not null default 0;
alter table public.ad_banners add column if not exists clicks integer not null default 0;

create index if not exists ad_banners_owner_idx on public.ad_banners(owner_id);
create index if not exists ad_banners_venue_idx on public.ad_banners(venue_key);

-- I MIEI banner (anche scaduti/disattivati), per la gestione dal "mio locale".
create or replace function public.my_banners(p_venue_key text default null)
returns setof public.ad_banners
language sql
security definer
set search_path = public
as $$
  select * from public.ad_banners
   where owner_id = auth.uid()
     and (p_venue_key is null or venue_key = p_venue_key)
   order by created_at desc;
$$;

-- Modifica di un banner proprio (testi/immagine/link).
create or replace function public.update_my_banner(
  p_id uuid,
  p_title text,
  p_body text,
  p_link_url text,
  p_cta text,
  p_image_url text,
  p_active boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ad_banners set
    title = coalesce(nullif(p_title, ''), title),
    body = p_body,
    link_url = p_link_url,
    cta = coalesce(nullif(p_cta, ''), cta),
    image_url = p_image_url,
    active = coalesce(p_active, active)
  where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'Banner non trovato o non tuo.';
  end if;
end;
$$;

-- Eliminazione di un banner proprio.
create or replace function public.delete_my_banner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ad_banners where id = p_id and owner_id = auth.uid();
  if not found then
    raise exception 'Banner non trovato o non tuo.';
  end if;
end;
$$;

-- Contatori analytics: chiamabili da chiunque veda il feed (anche anonimi).
create or replace function public.bump_banner_impressions(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_banners set impressions = impressions + 1 where id = any(p_ids);
$$;

create or replace function public.bump_banner_click(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_banners set clicks = clicks + 1 where id = p_id;
$$;

grant execute on function public.my_banners(text) to authenticated;
grant execute on function public.update_my_banner(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_my_banner(uuid) to authenticated;
grant execute on function public.bump_banner_impressions(uuid[]) to anon, authenticated;
grant execute on function public.bump_banner_click(uuid) to anon, authenticated;
