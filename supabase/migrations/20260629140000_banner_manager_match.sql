-- I banner di un locale devono essere gestibili da CHI gestisce quel locale (claim
-- approvato), non solo da chi risulta owner_id: i banner creati prima dell'aggiunta
-- di owner_id avevano owner nullo e sparivano dalla gestione. Allarghiamo il match.

-- Locale gestito dall'utente?
create or replace function public.manages_venue(p_venue_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.venue_claims
     where user_id = auth.uid() and venue_key = p_venue_key and status = 'approved'
  );
$$;

create or replace function public.my_banners(p_venue_key text default null)
returns setof public.ad_banners
language sql
security definer
set search_path = public
as $$
  select * from public.ad_banners b
   where (b.owner_id = auth.uid() or (b.venue_key is not null and public.manages_venue(b.venue_key)))
     and (p_venue_key is null or b.venue_key = p_venue_key)
   order by b.created_at desc;
$$;

create or replace function public.update_my_banner(
  p_id uuid, p_title text, p_body text, p_link_url text, p_cta text, p_image_url text, p_active boolean default null
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
  where id = p_id
    and (owner_id = auth.uid() or (venue_key is not null and public.manages_venue(venue_key)));
  if not found then raise exception 'Banner non trovato o non tuo.'; end if;
end;
$$;

create or replace function public.delete_my_banner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ad_banners
   where id = p_id
     and (owner_id = auth.uid() or (venue_key is not null and public.manages_venue(venue_key)));
  if not found then raise exception 'Banner non trovato o non tuo.'; end if;
end;
$$;

grant execute on function public.manages_venue(text) to authenticated;
