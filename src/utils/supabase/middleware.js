import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const updateSession = async (request) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Aggiorna la sessione solo se il token è scaduto. getSession() valida/rinnova
  // il JWT leggendo i cookie (rete solo se serve il refresh), mentre getUser()
  // faceva una chiamata di rete a Supabase Auth ad OGNI richiesta — costo inutile
  // dato che qui il proxy NON prende decisioni di autorizzazione (nessuna route
  // protetta lato server: le pagine sono client-component e le API route
  // verificano l'utente da sole). Taglia traffico sia su Vercel che su Supabase.
  await supabase.auth.getSession();

  return supabaseResponse;
};
