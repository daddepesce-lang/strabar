import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// GET /api/venues/directory — directory PUBBLICA di tutti i locali Strabar attivi.
//
// EGRESS: l'aggregazione la fa il DB (RPC get_venue_directory) e QUI mettiamo la risposta
// in cache sul CDN di Vercel. Prima /places scaricava l'INTERA tabella sessions sul client
// e aggregava in JS: ora è un JSON compatto servito dal bordo, senza toccare Supabase ad
// ogni visita. La ricerca/ordinamento avviene lato client su questo unico payload cacheato,
// così non moltiplichiamo le varianti di cache per termine di ricerca.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'config mancante' }, { status: 500 });
  }
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_venue_directory`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const venues = await res.json();
    return new NextResponse(JSON.stringify({ venues: venues || [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache sul CDN per 5 min con stale-while-revalidate: visite ripetute ~gratis.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err), venues: [] }, { status: 502 });
  }
}
