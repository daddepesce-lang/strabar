// Basemap unico per tutte le mappe dell'app (feed, dettaglio sessione, radar, percorsi,
// card social). Un solo posto da toccare per cambiare stile o provider.
//
// CARTO ha smesso di servire le tile "dark_all" in chiaro: senza chiave ogni tile torna
// con sopra la filigrana "API KEY REQUIRED". La chiave per i basemap è gratuita
// (carto.com/basemaps/apikey — form con email + dominio, 5M tile/mese) e vive nel client,
// quindi è una NEXT_PUBLIC_*. Senza chiave le mappe funzionano lo stesso, ma filigranate.
//
// Nessun impatto su egress Supabase o Fast Origin Transfer: le tile arrivano dalla CDN di
// CARTO. L'unica eccezione è la card social, che le fa passare da /api/img per poter
// esportare il canvas — lì cache lunga + s-maxage tengono l'origin fuori dal giro.

const KEY = (process.env.NEXT_PUBLIC_CARTO_KEY || '').trim();

// Se la chiave è incollata già in forma "parametro=valore" la usiamo tale e quale (CARTO ha
// usato sia `key` sia `api_key`), così basta cambiare la env se cambiano nome al parametro.
const QUERY = KEY ? `?${KEY.includes('=') ? KEY : `key=${encodeURIComponent(KEY)}`}` : '';

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Template per L.tileLayer (Leaflet sostituisce {s} {z} {x} {y} {r}).
export const MAP_TILE_URL = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${QUERY}`;

// Opzioni da passare a L.tileLayer insieme al template qui sopra.
export const MAP_TILE_OPTIONS = {
  attribution: MAP_TILE_ATTRIBUTION,
  subdomains: 'abcd',
  maxZoom: 20,
};

// URL di una singola tile, per chi le compone a mano su <canvas> (card social).
export function mapTileUrl(z, x, y, { retina = true } = {}) {
  return `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}${retina ? '@2x' : ''}.png${QUERY}`;
}
