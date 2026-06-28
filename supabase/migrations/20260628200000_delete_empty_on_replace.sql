-- Quando parte una nuova live, le ALTRE live dell'utente: se VUOTE (niente drink né media)
-- vengono ELIMINATE (spazzatura da avvii accidentali/test), le altre solo chiuse.
-- Così non restano nel diario/feed sessioni a 0 create per sbaglio.
create or replace function public.enforce_single_active_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.is_active is true then
    -- elimina le live vuote rimaste aperte
    delete from public.sessions
     where user_id = NEW.user_id
       and is_active is true
       and id is distinct from NEW.id
       and (drinks is null or jsonb_typeof(drinks) <> 'array' or jsonb_array_length(drinks) = 0)
       and (media  is null or jsonb_typeof(media)  <> 'array' or jsonb_array_length(media)  = 0);
    -- chiudi le eventuali altre (con contenuti)
    update public.sessions
       set is_active = false
     where user_id = NEW.user_id
       and is_active is true
       and id is distinct from NEW.id;
  end if;
  return NEW;
end;
$$;
