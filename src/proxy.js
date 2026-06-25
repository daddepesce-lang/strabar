import { NextResponse } from 'next/server';

// Redirect al dominio CANONICO (Next 16: convenzione `proxy`, non più `middleware`).
// Dopo il cambio dominio: chi apre un vecchio link (o www) finisce su strabar.app,
// mantenendo path e query. Esclude localhost e le preview *.vercel.app.
// Il dominio si prende da NEXT_PUBLIC_SITE_URL (come metadataBase in layout.js).
const CANONICAL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app')
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '')
  .toLowerCase();

export function proxy(request) {
  const bareHost = (request.headers.get('host') || '').split(':')[0].toLowerCase();

  if (
    !bareHost ||
    bareHost === CANONICAL ||
    bareHost === 'localhost' ||
    bareHost === '127.0.0.1' ||
    bareHost.endsWith('.vercel.app')
  ) {
    return NextResponse.next();
  }

  // Qualsiasi altro host (vecchio dominio, www, ecc.) → dominio canonico, 308 permanente.
  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.host = CANONICAL;
  url.port = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Solo le navigazioni: esclude api, asset statici Next e file con estensione.
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
