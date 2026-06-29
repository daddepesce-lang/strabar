-- Eliminando un banner, l'ordine collegato passa a 'ended' (terminato dal gestore,
-- nessun rimborso). Resta nello storico ordini col nuovo stato.
create or replace function public.delete_my_banner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_ok boolean;
begin
  select order_id, true into v_order, v_ok
    from public.ad_banners
   where id = p_id
     and (owner_id = auth.uid() or (venue_key is not null and public.manages_venue(venue_key)))
   limit 1;

  if not coalesce(v_ok, false) then
    raise exception 'Banner non trovato o non tuo.';
  end if;

  delete from public.ad_banners where id = p_id;

  if v_order is not null then
    update public.venue_orders set status = 'ended' where id = v_order;
  end if;
end;
$$;
