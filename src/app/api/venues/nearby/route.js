import { NextResponse } from 'next/server';
import { googleNearbySearch, GOOGLE_VENUES_ENABLED } from '@/lib/venues-google';
import { reserveGoogleCall } from '@/lib/api-quota';

export const dynamic = 'force-dynamic';

// GET /api/venues/nearby?lat=&lng=&radius=
// Locali reali attorno a una posizione GPS. Prova Google Places (se configurato e sotto
// quota), altrimenti { source: 'osm' } → il client interroga Overpass direttamente.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  const radius = parseInt(searchParams.get('radius') || '1000', 10);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ source: 'osm', venues: [] });
  }
  if (!GOOGLE_VENUES_ENABLED) return NextResponse.json({ source: 'osm' });

  const allowed = await reserveGoogleCall();
  if (!allowed) return NextResponse.json({ source: 'osm' });

  try {
    const venues = await googleNearbySearch(lat, lng, Number.isFinite(radius) ? radius : 1000);
    return NextResponse.json({ source: 'google', venues });
  } catch (err) {
    console.warn('Google searchNearby fallita, fallback OSM:', err.message || err);
    return NextResponse.json({ source: 'osm' });
  }
}
