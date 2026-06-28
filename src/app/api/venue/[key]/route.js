import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Classifica PUBBLICA del locale (pagina /locale/[key], QR nei bar).
//
// EGRESS: l'aggregazione la fa il DB (RPC get_venue_public_board) e QUI mettiamo la
// risposta in cache sul CDN di Vercel (s-maxage). Così le scansioni ripetute dello
// stesso QR vengono servite dal bordo, SENZA toccare Supabase ad ogni richiesta.
// Il payload è minuscolo (solo nomi + numeri), quindi anche il transfer è trascurabile.

export async function GET(req, { params }) {
  const { key } = await params;
  const placeKey = decodeURIComponent(key || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!placeKey) {
    return NextResponse.json({ error: 'key mancante' }, { status: 400 });
  }
  const period = req.nextUrl.searchParams.get('period') === 'week' ? 'week' : 'all';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'config mancante' }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_venue_public_board`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: placeKey, p_period: period }),
      // niente cache lato fetch: la cache "vera" è quella del CDN sotto (header sotto)
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const data = await res.json();
    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache sul CDN per 5 min, con stale-while-revalidate: scansioni del QR ~gratis.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
