// Estrazione della CITTÀ (comune) da una stringa di indirizzo, tutto lato client.
// Perché lato client e senza geocoding: le tappe dei percorsi salvano già l'indirizzo
// (campo `note`/`address`) restituito dalla ricerca (Google Places o Nominatim/OSM).
// Fare reverse-geocoding delle coordinate costerebbe chiamate/quota ed egress: qui invece
// NON facciamo alcuna richiesta di rete — parsiamo il testo che abbiamo già in mano.
//
// Gestisce i due formati tipici:
//   • Nominatim:  "Cantina Do Mori, Calle Do Mori, San Polo, Venezia, Città Metropolitana di Venezia, Veneto, 30125, Italia"
//   • Google:     "Calle Do Mori, 429, 30125 Venezia VE, Italia"
// Regola d'oro: vogliamo il COMUNE (Venezia, Padova…), MAI un quartiere/sestiere
// (San Polo, Cannaregio…) né una provincia/regione. In caso di dubbio → null
// (meglio nessun chip che un chip sbagliato).

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

// Quartieri / sestieri che NON sono comuni: vanno esclusi, altrimenti la lista mostra
// "San Polo" al posto di "Venezia". Sono i casi che si vedono più spesso nei bacaro tour.
const NEIGHBORHOODS = new Set([
  // Sestieri di Venezia
  'san marco', 'cannaregio', 'castello', 'dorsoduro', 'san polo', 'santa croce',
  'giudecca', 'sacca fisola',
  // Zone/quartieri comuni scambiati per comune dai geocoder
  'trastevere', 'testaccio', 'centro storico', 'centro', 'lido',
]);

// ODONIMI: parole con cui inizia un nome di STRADA o PIAZZA, mai di comune.
// "Campo Santa Margherita", "Fondamenta dei Frari", "Calle Larga" sono luoghi dentro
// una città, non la città — e senza questo filtro finivano nel titolo delle pagine
// pubbliche ("...a Campo Santa Margherita" invece di "...a Venezia").
const STREET_PREFIX = /^(via|viale|vicolo|piazza|piazzale|piazzetta|campo|campiello|calle|callesela|fondamenta|riva|salizada|salizzada|ruga|rio ter[àa]|sotoportego|sottoportico|corte|ramo|corso|largo|lungomare|strada|stradone|borgo|contrada|localit[àa]|frazione|molo|ponte|parco|giardin[oi])\b/i;

// Prefissi amministrativi da rimuovere per isolare il nome del comune:
// "Città Metropolitana di Venezia" → "Venezia", "Provincia di Padova" → "Padova".
const ADMIN_PREFIX = /^(citt[àa] metropolitana di|provincia di|comune di|city of|municipality of|province of)\s+/i;

// Segmenti puramente amministrativi (senza nome) da scartare del tutto.
const ADMIN_BARE = /^(citt[àa] metropolitana|provincia|comune|municipio|regione|county)$/i;

// Note segnaposto salvate quando una tappa NON ha un vero indirizzo (es. bar aggiunti
// da "esplora sulla mappa" nelle versioni precedenti): non sono indirizzi, niente città.
const PLACEHOLDER_NOTE = /trovato tramite ricerca|found via search/i;

// Capitalizza in modo leggibile una città tutta minuscola ("venezia" → "Venezia"),
// preservando i nomi che hanno già maiuscole ("San Donà di Piave").
const prettifyCity = (s) => {
  if (/[A-ZÀ-Þ]/.test(s)) return s; // ha già maiuscole: lascia com'è
  return s.replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());
};

/**
 * Ritorna la migliore stima del COMUNE da una stringa di indirizzo, oppure null.
 * @param {string} address
 * @returns {string|null}
 */
export function cityFromAddress(address) {
  if (!address || typeof address !== 'string') return null;
  if (PLACEHOLDER_NOTE.test(address)) return null;

  let parts = address.split(',').map((s) => s.trim()).filter(Boolean);

  // Fidati SOLO di un vero indirizzo postale: deve avere un CAP oppure finire con una
  // nazione nota. Senza questi marcatori la stringa è quasi sempre un nome di locale,
  // una via o una nota — e restituire quello come "città" è ciò che sporcava la lista.
  const hasPostcode = /\b\d{4,6}\b/.test(address);
  const hasCountry = parts.length > 0 && COUNTRIES.has(parts[parts.length - 1].toLowerCase());
  if (!hasPostcode && !hasCountry) return null;

  // Togli il paese in coda (può ripetersi: "…, Italia, Italia").
  while (parts.length && COUNTRIES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (!parts.length) return null;

  const cleaned = parts
    // Rimuovi CAP (4-6 cifre) ovunque nel segmento.
    .map((p) => p.replace(/\b\d{4,6}\b/g, ' ').replace(/\s+/g, ' ').trim())
    // Rimuovi la sigla provincia (2 maiuscole) in testa o in coda: "Venezia VE" → "Venezia".
    .map((p) => p.replace(/\s+\b[A-Z]{2}\b$/, '').replace(/^\b[A-Z]{2}\b\s+/, '').trim())
    // Isola il comune dai prefissi amministrativi: "Città Metropolitana di Venezia" → "Venezia".
    .map((p) => p.replace(ADMIN_PREFIX, '').trim())
    // Nominatim nomina alcuni comuni unendo le località con i trattini
    // ("Venezia-Murano-Burano"): il comune è il primo pezzo.
    .map((p) => (/^[A-Za-zÀ-ÿ]+(-[A-Za-zÀ-ÿ]+){1,}$/.test(p) && !REGIONS.has(p.toLowerCase()) ? p.split('-')[0].trim() : p))
    .filter(Boolean);

  // Tieni solo i segmenti che possono essere un comune: scarta regioni, quartieri/sestieri,
  // segmenti amministrativi "nudi", numeri civici e token troppo corti.
  const candidates = cleaned.filter((p) => {
    const lc = p.toLowerCase();
    if (REGIONS.has(lc)) return false;
    if (NEIGHBORHOODS.has(lc)) return false;
    if (ADMIN_BARE.test(p)) return false;
    if (STREET_PREFIX.test(p)) return false;         // via/campo/fondamenta…: è un indirizzo, non un comune
    if (/^[A-Z]{2}$/.test(p)) return false;          // sigla provincia isolata (VE, PD, MI)
    if (/^\d+$/.test(p)) return false;               // solo numero (civico)
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(p)) return false;    // deve avere lettere
    return true;
  });
  if (!candidates.length) return null;

  // Ordine tipico: via → quartiere → COMUNE → provincia → regione → CAP → paese.
  // Dopo aver tolto quartieri, province e regioni, il comune è l'ultimo candidato rimasto.
  return prettifyCity(candidates[candidates.length - 1]);
}

/**
 * Estrae la lista ordinata e senza duplicati delle città (comuni) toccate da un percorso,
 * leggendo l'indirizzo di ogni tappa (`address` se presente, altrimenti `note`).
 * @param {{waypoints?: Array<{address?:string, note?:string}>}} route
 * @returns {string[]}
 */
export function routeCities(route) {
  const wps = route?.waypoints || [];
  const seen = new Set();
  const cities = [];
  for (const wp of wps) {
    // Preferisci la città STRUTTURATA salvata al momento dell'aggiunta (dal geocoder):
    // è affidabile. Solo per le tappe vecchie (senza `city`) ripieghiamo sul parsing.
    const city = (wp?.city && String(wp.city).trim()) || cityFromAddress(wp?.address || wp?.note || '');
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }
  return cities;
}
