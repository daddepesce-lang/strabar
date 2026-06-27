import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Proxy immagini SAME-ORIGIN per l'export social.
//
// I media stanno su Cloudflare R2 (dominio pubblico *.r2.dev) che NON invia header CORS.
// Disegnare quelle immagini su un <canvas> con crossOrigin='anonymous' fallisce (onerror),
// e senza crossOrigin il canvas si "sporca" (tainted) e toBlob/toDataURL lanciano un errore
// di sicurezza. Servendo l'immagine dal NOSTRO dominio, il browser non applica più CORS:
// il canvas resta esportabile e la card social mostra finalmente la foto.
//
// È un proxy CHIUSO: accetta solo host noti (R2 / Supabase Storage), così non diventa un
// open-proxy sfruttabile per SSRF.

function hostAllowed(host) {
  if (!host) return false;
  // Host del bucket pubblico R2 configurato (se presente in env)
  try {
    const configured = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).host : null;
    if (configured && host === configured) return true;
  } catch { /* env malformata: ignora */ }
  // Tile mappa CARTO (dark) per lo sfondo-mappa della card: gratis, senza chiave,
  // immutabili → cache lunga. Egress contenuto (pochi tile per card, riusati dalla cache).
  if (host.endsWith('.basemaps.cartocdn.com') || host === 'basemaps.cartocdn.com') return true;
  // Solo R2: i media stanno tutti su Cloudflare R2. Niente Supabase Storage (egress).
  return (
    host.endsWith('.r2.dev') ||
    host.endsWith('.r2.cloudflarestorage.com')
  );
}

export async function GET(req) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) {
    return NextResponse.json({ error: 'Parametro url mancante' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'URL non valido' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !hostAllowed(parsed.host)) {
    return NextResponse.json({ error: 'Host non consentito' }, { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString(), { cache: 'force-cache' });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Immagine non raggiungibile' }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Non è un\'immagine' }, { status: 415 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // I nomi file R2 (e i tile mappa) sono immutabili → cache lunga.
        //  • max-age   = cache del BROWSER
        //  • s-maxage  = cache della CDN Vercel (FONDAMENTALE): senza, OGNI richiesta
        //    immagine ricolpiva la funzione origin → Fast Origin Transfer enorme.
        //    Con s-maxage la stessa foto/tile è servita dal bordo dopo la 1ª volta.
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400, immutable',
        'CDN-Cache-Control': 'public, s-maxage=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Proxy immagine fallito:', err);
    return NextResponse.json({ error: 'Errore proxy immagine' }, { status: 502 });
  }
}
