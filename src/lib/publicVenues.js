// Lettura SERVER-SIDE dei locali pubblici, per le pagine indicizzabili /locale/[key],
// /locali/[citta], le anteprime social e la sitemap.
//
// EGRESS: stesso principio di lib/publicRoutes — chiamata REST diretta con la chiave anon e
// risposta messa in cache da Next (`next.revalidate`). UNA query all'ora per TUTTA la
// directory dei locali, non una per visitatore: duecento cartelli scansionati mille volte
// costano comunque una lettura all'ora. Gli aggregati li fa già il DB (RPC), quindi il
// payload è piccolo e il Fast Origin Transfer resta invariato rispetto a oggi.
//
// PRIVACY: non filtriamo nulla a mano. Gli RPC `get_venue_directory` e
// `get_venue_public_board` considerano SOLO sessioni pubbliche, verificate e geolocalizzate,
// e i nomi in classifica rispettano già le preferenze di visibilità del profilo.

import { cityFromVenueAddress } from '@/lib/cityFromAddress';

const CACHE_SECONDS = 3600; // 1 ora

const REST = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
};

/** Chiave canonica di un locale: minuscolo, spazi normalizzati (come fa il DB). */
export const venueKey = (name) =>
  (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function rpc(fn, body, tag) {
  const cfg = REST();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: cfg.anon,
        Authorization: `Bearer ${cfg.anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      next: { revalidate: CACHE_SECONDS, tags: [tag] },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Tutti i locali con almeno un check-in verificato, con indirizzo e numeri.
 * Una sola query condivisa da pagine città, sitemap e metadati: in cache per un'ora.
 */
export async function getPublicVenues() {
  const rows = await rpc('get_venue_directory', {}, 'public-venues');
  return Array.isArray(rows) ? rows : [];
}

/** La riga di directory di UN locale (indirizzo, coordinate, numeri), o null. */
export async function getPublicVenue(key) {
  const k = venueKey(key);
  if (!k) return null;
  const all = await getPublicVenues();
  return all.find((v) => venueKey(v.key) === k) || null;
}

/** Classifica pubblica del locale ('all' o 'week'), o null se il DB non risponde. */
export async function getVenueBoard(key, period = 'all') {
  const k = venueKey(key);
  if (!k) return null;
  const data = await rpc(
    'get_venue_public_board',
    { p_key: k, p_period: period === 'week' ? 'week' : 'all' },
    `venue-board-${k}`
  );
  return data && typeof data === 'object' ? data : null;
}

/** Città del locale, dedotta dall'indirizzo (stringa vuota se non ricavabile). */
export const venueCity = (venue) => cityFromVenueAddress(venue?.address || '') || '';

/** Locali pubblici raggruppati per città, dalla più popolata alla meno. */
export async function getVenuesByCity() {
  const venues = await getPublicVenues();
  const map = new Map();
  for (const v of venues) {
    const city = venueCity(v);
    if (!city) continue;
    if (!map.has(city)) map.set(city, []);
    map.get(city).push(v);
  }
  return [...map.entries()]
    .map(([city, list]) => ({
      city,
      venues: list.sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0)),
    }))
    .sort((a, b) => b.venues.length - a.venues.length);
}
