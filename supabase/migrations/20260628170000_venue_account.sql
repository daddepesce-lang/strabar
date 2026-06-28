-- Account di tipo "locale" (business) + onboarding via email dopo l'approvazione.

-- 1) Tipo account sul profilo: 'user' (default) | 'venue'
alter table public.profiles add column if not exists account_type text not null default 'user';

-- 2) La richiesta può arrivare da un locale SENZA account (lead): user_id diventa nullable.
alter table public.venue_claims alter column user_id drop not null;

-- 3) Trigger registrazione: riporta anche account_type dai metadati signup (default 'user').
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, is_premium, consent_version, tos_accepted_at, account_type)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        FALSE,
        new.raw_user_meta_data->>'consent_version',
        CASE WHEN new.raw_user_meta_data->>'consent_version' IS NOT NULL THEN NOW() ELSE NULL END,
        COALESCE(new.raw_user_meta_data->>'account_type', 'user')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Invio richiesta gestione anche da NON loggati (lead): inserisce un claim pending.
--    Se loggato, allega user_id; altrimenti resta null (verrà collegato all'approvazione).
create or replace function public.submit_venue_lead(p_key text, p_name text, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.venue_claims (venue_key, venue_name, user_id, status, note, details)
  values (p_key, coalesce(p_name, p_key), auth.uid(), 'pending', p_details->>'note', p_details);
end;
$$;
grant execute on function public.submit_venue_lead(text, text, jsonb) to anon, authenticated;

-- 5) Lookup id utente per email (solo service role → API admin: collega account↔locale).
create or replace function public.admin_find_user_id(p_email text)
returns uuid language sql security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.admin_find_user_id(text) from public, anon, authenticated;
