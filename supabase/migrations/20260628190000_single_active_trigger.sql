-- GARANZIA DEFINITIVA: una sola sessione live per utente, applicata dal DB con un TRIGGER.
-- Finora ci affidavamo a: (1) chiusura lato app prima dell'insert e (2) indice unico parziale.
-- Ma (1) usa il contesto RLS dell'utente e, se per qualunque motivo l'UPDATE non va a buon
-- fine (timeout/policy), la live precedente resta attiva → più live insieme. Questo trigger
-- gira come OWNER (security definer): a OGNI insert/riattivazione di una sessione attiva,
-- chiude TUTTE le altre live dell'utente. Copre ogni percorso (libera, locale, evento, tour,
-- tag, append) e non dipende dalla RLS né dal codice client.

create or replace function public.enforce_single_active_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.is_active is true then
    update public.sessions
       set is_active = false
     where user_id = NEW.user_id
       and is_active is true
       and id is distinct from NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_single_active on public.sessions;
create trigger trg_single_active
  before insert or update of is_active on public.sessions
  for each row execute function public.enforce_single_active_session();

-- Bonifica immediata: per ogni utente tieni attiva solo la più recente.
update public.sessions s
   set is_active = false
 where s.is_active = true
   and s.id <> (
     select s2.id from public.sessions s2
     where s2.user_id = s.user_id and s2.is_active = true
     order by s2.created_at desc, s2.id desc limit 1
   );

-- Rete di sicurezza per le inserzioni CONCORRENTI (indice unico parziale).
create unique index if not exists one_active_session_per_user
  on public.sessions (user_id) where is_active;
