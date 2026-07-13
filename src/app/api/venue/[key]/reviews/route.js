import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// GET /api/venue/[key]/reviews — recensioni PUBBLICHE di un locale (media, conteggio, elenco).
//
// EGRESS: aggregazione via RPC get_venue_reviews + cache CDN (come /api/venue/[key]). La
// scrittura di una recensione NON passa da qui: va diretta a Supabase (RLS con gate
// "solo chi c'è stato"), quindi qui serviamo solo la lettura, cacheabile.
export async function GET(req, { params }) {
  const { key } = await params;
  const placeKey = decodeURIComponent(key || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!placeKey) {
    return NextResponse.json({ error: 'key mancante' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'config mancante' }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_venue_reviews`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: placeKey }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const data = await res.json();
    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache breve: una recensione nuova appare entro ~1 min.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
