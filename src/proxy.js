import { NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// Next 16: convenzione `proxy` (il vecchio `middleware` è deprecato). Runtime nodejs.
// Due compiti: 1) redirect dai vecchi domini al canonico; 2) refresh sessione Supabase.

// Host canonico dell'app (es. "strabar.app"). I link condivisi puntano qui.
const CANONICAL_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://strabar.app")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

// Vecchi domini da reindirizzare al canonico: così i link già condivisi (es. su WhatsApp)
// che puntano al vecchio dominio aprono sul nuovo e vengono catturati dalla PWA installata.
const LEGACY_HOSTS = new Set(["strabar-delta.vercel.app"]);

export async function proxy(request) {
  const host = request.headers.get("host") || "";
  if (LEGACY_HOSTS.has(host) && host !== CANONICAL_HOST) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    // Segnala l'arrivo dal vecchio dominio: il client mostra un avviso "reinstalla l'app".
    url.searchParams.set("legacy", "1");
    // 308 = redirect permanente che preserva il metodo e (qui) path + query string.
    return NextResponse.redirect(url, 308);
  }

  // I prefetch RSC di Next (speculativi, scattano per ogni <Link> nel viewport)
  // non hanno bisogno di rinfrescare la sessione: ci pensa la navigazione vera.
  // Chiamare Supabase su ogni prefetch moltiplicava Edge Request + Origin Transfer
  // su Vercel e le chiamate Auth su Supabase. Per i prefetch lasciamo passare liscio.
  if (request.headers.get("next-router-prefetch") === "1") {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (le API route verificano l'utente da sole: niente refresh sessione)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico / sw.js / manifest (asset PWA serviti statici)
     * Escludendo /api evitiamo di invocare il proxy (e Supabase) due volte per ogni
     * chiamata API.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
