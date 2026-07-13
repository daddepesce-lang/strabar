// Ricerca locali via Google Places API (New) — USO SOLO LATO SERVER.
// La chiave (GOOGLE_MAPS_API_KEY) non deve MAI finire nel bundle client: questo modulo
// è importato solo dalle route /api/venues/*, che decidono se usare Google o tornare a OSM
// in base alla quota mensile (vedi migration api_usage_quota).
//
// I risultati sono normalizzati nella STESSA forma dei locali OSM (src/lib/db.js
// _normalizeOsmVenue) così il resto dell'app li tratta in modo identico e — punto chiave —
// la chiave canonica è nome+coordinate, non l'id Google: un locale trovato con Google e
// usato in una sessione resta trovabile anche quando si è su OpenStreetMap.

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1';

// DEVE combaciare con normalizePlaceKey in src/lib/db.js (lower + spazi singoli), altrimenti
// la deduplica con i locali community e le classifiche per locale non funzionano.
function normalizePlaceKey(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Tipi Google puramente geografici: NON sono locali selezionabili.
const NON_VENUE_TYPES = new Set([
  'locality', 'sublocality', 'political', 'country', 'administrative_area_level_1',
  'administrative_area_level_2', 'administrative_area_level_3', 'route', 'street_address',
  'postal_code', 'neighborhood', 'plus_code', 'geocode',
]);

// Tipi Google (New Places, Table A) che consideriamo "locale da bere/mangiare".
const NEARBY_TYPES = ['bar', 'night_club', 'restaurant', 'cafe', 'liquor_store', 'meal_takeaway'];

function isVenueTypes(types) {
  const t = types || [];
  if (!t.length) return false;
  return !t.some((x) => NON_VENUE_TYPES.has(x));
}

function normalizeGooglePlace(p) {
  const name = p?.displayName?.text || null;
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  const types = p.types || [];
  return {
    key: normalizePlaceKey(name) + '|' + lat.toFixed(4) + ',' + lng.toFixed(4),
    name,
    address: p.formattedAddress || '',
    lat,
    lng,
    amenity: p.primaryType || (types[0] || ''),
    osmClass: 'amenity',
    osmType: p.primaryType || (types[0] || ''),
    isVenue: isVenueTypes(types),
    source: 'google',
    avgRating: 0,
    reviewsCount: 0,
    uniqueDrinkers: 0,
    sessionsCount: 0,
  };
}

function apiKey() {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw new Error('GOOGLE_MAPS_API_KEY non configurata');
  return k;
}

// Ricerca per nome/testo. `near` opzionale ({lat,lng}) come bias geografico.
export async function googleTextSearch(query, near = null) {
  const body = {
    textQuery: query,
    languageCode: 'it',
    maxResultCount: 20,
  };
  if (near && typeof near.lat === 'number' && typeof near.lng === 'number') {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 15000 },
    };
  }
  const res = await fetch(`${PLACES_ENDPOINT}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.location,places.primaryType,places.types',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google searchText ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.places || []).map(normalizeGooglePlace).filter(Boolean);
}

// Locali reali entro `radius` metri da una posizione GPS.
export async function googleNearbySearch(lat, lng, radius = 1000) {
  const body = {
    includedTypes: NEARBY_TYPES,
    maxResultCount: 20,
    languageCode: 'it',
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(Math.max(radius, 1), 50000),
      },
    },
  };
  const res = await fetch(`${PLACES_ENDPOINT}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.location,places.primaryType,places.types',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google searchNearby ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.places || []).map(normalizeGooglePlace).filter(Boolean);
}

// Recupera i CONTATTI di un locale (telefono + sito) per l'outreach admin. Usa searchText
// con field mask estesa. NB: telefono/sito sono nello SKU "Pro" di Places → costa un po' di
// più della sola ricerca base; da chiamare on-demand (bottone admin), non in massa.
export async function googleVenueContact(query, near = null) {
  const body = { textQuery: query, languageCode: 'it', maxResultCount: 1 };
  if (near && typeof near.lat === 'number' && typeof near.lng === 'number') {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 5000 } };
  }
  const res = await fetch(`${PLACES_ENDPOINT}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.location',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google contact ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const p = (data.places || [])[0];
  if (!p) return null;
  return {
    name: p.displayName?.text || null,
    address: p.formattedAddress || null,
    phone: p.internationalPhoneNumber || null,
    website: p.websiteUri || null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  };
}

export const GOOGLE_VENUES_ENABLED = !!process.env.GOOGLE_MAPS_API_KEY;
