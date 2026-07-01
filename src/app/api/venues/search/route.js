import { NextResponse } from 'next/server';
import { googleTextSearch, GOOGLE_VENUES_ENABLED } from '@/lib/venues-google';
import { reserveGoogleCall } from '@/lib/api-quota';

export const dynamic = 'force-dynamic';

// GET /api/venues/search?q=...&lat=&lng=
// Ricerca locali per nome. Prova Google Places (se configurato e sotto quota), altrimenti
// risponde { source: 'osm' } SENZA risultati: è il client a interrogare OpenStreetMap
// direttamente (così il payload OSM non passa da Vercel → nessun Fast Origin Transfer extra).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  const near = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  if (q.length < 2) return NextResponse.json({ source: 'osm', venues: [] });
  if (!GOOGLE_VENUES_ENABLED) return NextResponse.json({ source: 'osm' });

  const allowed = await reserveGoogleCall();
  if (!allowed) return NextResponse.json({ source: 'osm' });

  try {
    const venues = await googleTextSearch(q, near);
    return NextResponse.json({ source: 'google', venues });
  } catch (err) {
    console.warn('Google searchText fallita, fallback OSM:', err.message || err);
    return NextResponse.json({ source: 'osm' });
  }
}
