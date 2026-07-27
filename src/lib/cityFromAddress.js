// Estrazione della CITTÀ da una stringa di indirizzo, tutto lato client.
// Perché lato client e senza geocoding: le tappe dei percorsi salvano già l'indirizzo
// (campo `note`/`address`) restituito dalla ricerca (Google Places o Nominatim/OSM).
// Fare reverse-geocoding delle coordinate costerebbe chiamate/quota ed egress: qui invece
// NON facciamo alcuna richiesta di rete — parsiamo il testo che abbiamo già in mano.
//
// Gestisce i due formati tipici:
//   • Nominatim:  "Cantina Do Mori, Calle Do Mori, San Polo, Venezia, Veneto, 30125, Italia"
//   • Google:     "Calle Do Mori, 429, 30125 Venezia VE, Italia"
// e ripiega su null quando non riesce a riconoscere una città (meglio niente che sbagliato).

const COUNTRIES = new Set([
  'italia', 'italy', 'france', 'francia', 'spain', 'spagna', 'españa', 'espana',
  'deutschland', 'germany', 'germania', 'switzerland', 'svizzera', 'suisse',
  'austria', 'österreich', 'osterreich', 'united kingdom', 'uk', 'england',
  'portugal', 'portogallo', 'belgium', 'belgio', 'nederland', 'netherlands',
]);

// Regioni italiane (in minuscolo, con e senza trattino) da NON scambiare per città.
const REGIONS = new Set([
  'veneto', 'lombardia', 'lazio', 'toscana', 'piemonte', 'liguria',
  'emilia-romagna', 'emilia romagna', 'campania', 'sicilia', 'sardegna',
  'puglia', 'calabria', 'marche', 'abruzzo', 'umbria',
  'friuli-venezia giulia', 'friuli venezia giulia', 'friuli',
  'trentino-alto adige', 'trentino alto adige', 'trentino', 'alto adige',
  'molise', 'basilicata', "valle d'aosta", 'valle daosta', 'aosta valley',
]);

// Capitalizza in modo leggibile una città tutta minuscola ("venezia" → "Venezia"),
// preservando i nomi che hanno già maiuscole ("San Donà di Piave").
const prettifyCity = (s) => {
  if (/[A-ZÀ-Þ]/.test(s)) return s; // ha già maiuscole: lascia com'è
  return s.replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());
};

/**
 * Ritorna la migliore stima della città da una stringa di indirizzo, oppure null.
 * @param {string} address
 * @returns {string|null}
 */
// Note segnaposto salvate quando una tappa NON ha un vero indirizzo (es. bar aggiunti
// da "esplora sulla mappa" nelle versioni precedenti): non sono indirizzi, niente città.
const PLACEHOLDER_NOTE = /trovato tramite ricerca|found via search/i;

export function cityFromAddress(address) {
  if (!address || typeof address !== 'string') return null;
  if (PLACEHOLDER_NOTE.test(address)) return null;

  let parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  // Togli il paese in coda (può ripetersi: "…, Italia, Italia").
  while (parts.length && COUNTRIES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (!parts.length) return null;

  // Pulisci ogni segmento: rimuovi CAP (4-6 cifre) e sigla provincia (2 maiuscole,
  // es. "Venezia VE" → "Venezia", "MI Milano" → "Milano").
  const cleaned = parts
    .map((p) => p.replace(/\b\d{4,6}\b/g, ' ').replace(/\s+/g, ' ').trim())
    .map((p) => p.replace(/\s+\b[A-Z]{2}\b$/, '').replace(/^\b[A-Z]{2}\b\s+/, '').trim())
    .filter(Boolean);

  // Scarta le regioni: non sono città.
  const candidates = cleaned.filter((p) => !REGIONS.has(p.toLowerCase()));
  if (!candidates.length) return null;

  // La città è, negli indirizzi, l'ultimo segmento "nominale" prima di regione/CAP/paese
  // (via → quartiere → città → provincia → regione → CAP → paese). Scorriamo dal fondo e
  // prendiamo il primo segmento che sembra un nome di luogo (lettere, non solo numeri).
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    if (/[a-zA-ZÀ-ÿ]{2,}/.test(c) && !/^\d+$/.test(c)) return prettifyCity(c);
  }
  return null;
}

/**
 * Estrae la lista ordinata e senza duplicati delle città toccate da un percorso,
 * leggendo l'indirizzo di ogni tappa (`address` se presente, altrimenti `note`).
 * @param {{waypoints?: Array<{address?:string, note?:string}>}} route
 * @returns {string[]}
 */
export function routeCities(route) {
  const wps = route?.waypoints || [];
  const seen = new Set();
  const cities = [];
  for (const wp of wps) {
    const city = cityFromAddress(wp?.address || wp?.note || '');
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }
  return cities;
}
