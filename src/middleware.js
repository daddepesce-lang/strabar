import { NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// Host canonico dell'app (es. "strabar.app"). I link condivisi puntano qui.
const CANONICAL_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://strabar.app")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

// Vecchi domini da reindirizzare al canonico: così i link già condivisi (es. su WhatsApp)
// che puntano al vecchio dominio aprono sul nuovo e vengono catturati dalla PWA installata.
const LEGACY_HOSTS = new Set(["strabar-delta.vercel.app"]);

export async function middleware(request) {
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
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
