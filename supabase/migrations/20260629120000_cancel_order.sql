-- Annullamento ordine da parte del gestore: consentito SOLO se l'ordine è ancora
-- "pending" (non pagato). Gli ordini pagati/attivi non si toccano da qui.
-- RLS su venue_orders blocca l'UPDATE diretto, quindi passiamo da un RPC owner-checked.
create or replace function public.cancel_venue_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venue_orders
     set status = 'canceled'
   where id = p_order_id
     and user_id = auth.uid()
     and status = 'pending';
  if not found then
    raise exception 'Ordine non annullabile (inesistente, non tuo o già pagato).';
  end if;
end;
$$;

grant execute on function public.cancel_venue_order(uuid) to authenticated;
