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

  // Ogni segmento si porta dietro se proveniva da un'area AMMINISTRATIVA ("Città
  // Metropolitana di Venezia", "Provincia di Padova"): il nome che contiene è quello del
  // capoluogo, non del comune del locale. Nell'ordine Nominatim viene dopo il comune,
  // quindi senza questa distinzione un bar a Olmo di Mirano finiva sotto "Venezia".
  // La marcatura è per POSIZIONE, non per testo: "Venezia" può comparire due volte (una
  // come comune e una come città metropolitana) e sono due cose diverse.
  const cleaned = parts
    .map((p, i) => ({ text: p, idx: i, admin: ADMIN_PREFIX.test(p) }))
    // Rimuovi CAP (4-6 cifre) ovunque nel segmento.
    .map((e) => ({ ...e, text: e.text.replace(/\b\d{4,6}\b/g, ' ').replace(/\s+/g, ' ').trim() }))
    // Rimuovi la sigla provincia (2 maiuscole) in testa o in coda: "Venezia VE" → "Venezia".
    .map((e) => ({ ...e, text: e.text.replace(/\s+\b[A-Z]{2}\b$/, '').replace(/^\b[A-Z]{2}\b\s+/, '').trim() }))
    // Isola il comune dai prefissi amministrativi: "Città Metropolitana di Venezia" → "Venezia".
    .map((e) => ({ ...e, text: e.text.replace(ADMIN_PREFIX, '').trim() }))
    // Nominatim nomina alcuni comuni unendo le località con i trattini
    // ("Venezia-Murano-Burano"): il comune è il primo pezzo.
    .map((e) => ({
      ...e,
      text:
        /^[A-Za-zÀ-ÿ]+(-[A-Za-zÀ-ÿ]+){1,}$/.test(e.text) && !REGIONS.has(e.text.toLowerCase())
          ? e.text.split('-')[0].trim()
          : e.text,
    }))
    .filter((e) => e.text);

  // Tieni solo i segmenti che possono essere un comune: scarta regioni, quartieri/sestieri,
  // segmenti amministrativi "nudi", numeri civici e token troppo corti.
  const candidates = cleaned.filter(({ text: p }) => {
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

  // Ordine italiano tipico: locale → via → frazione → COMUNE → provincia → REGIONE →
  // CAP → paese. La provincia spesso non si annuncia ("…, Mira, Venezia, Veneto, …":
  // quel "Venezia" è la provincia, il comune è Mira), quindi non basta guardare i
  // prefissi amministrativi: usiamo la REGIONE come pietra miliare e scartiamo il
  // segmento che la precede, che è la provincia.
  const regionIdx = cleaned.findIndex((e) => REGIONS.has(e.text.toLowerCase()));
  const pool = regionIdx >= 0 ? candidates.filter((e) => e.idx < regionIdx) : candidates;
  if (!pool.length) return prettifyCity(candidates[candidates.length - 1].text);

  if (regionIdx >= 0 && pool.length >= 2) {
    const comune = pool[pool.length - 2];
    // GUARDIA: se scartando la "provincia" finiremmo sul primo segmento (che è il nome
    // del locale, non un comune), allora quell'indirizzo la provincia non ce l'aveva:
    // meglio tenere l'ultimo segmento così com'è.
    if (comune.idx > 0) return prettifyCity(comune.text);
    return prettifyCity(pool[pool.length - 1].text);
  }

  // Nessuna regione in coda (formato Google, o indirizzo corto): vale l'ultimo candidato,
  // preferendo quelli che non vengono da un'area amministrativa.
  const plain = pool.filter((e) => !e.admin);
  const pick = plain.length ? plain : pool;
  return prettifyCity(pick[pick.length - 1].text);
}

/**
 * Variante per gli INDIRIZZI DEI LOCALI (`venues.address`, directory dei bar).
 *
 * `cityFromAddress` pretende un CAP o una nazione prima di fidarsi: giusto per le tappe
 * dei percorsi, dove un falso positivo sporca il titolo di una pagina pubblica. Ma gli
 * indirizzi dei locali sono spesso scritti a mano dal gestore ("Via Belvedere 3, Mirano")
 * e con quella regola nessuno di loro finirebbe nella pagina della propria città.
 *
 * Qui accettiamo anche l'ultimo segmento nudo, applicando però gli STESSI filtri di
 * sicurezza: niente vie, quartieri, regioni, nazioni o sigle di provincia. In caso di
 * dubbio torniamo null: meglio un locale senza città che nella città sbagliata.
 */
export function cityFromVenueAddress(address) {
  const strict = cityFromAddress(address);
  if (strict) return strict;
  if (!address || typeof address !== 'string') return null;
  if (PLACEHOLDER_NOTE.test(address)) return null;

  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  // Un solo segmento è quasi sempre il nome del locale, non un indirizzo.
  if (parts.length < 2) return null;

  const cleaned = parts
    .map((p) => p.replace(/\(([A-Za-z]{2})\)\s*$/, ''))       // "Dolo (VE)" → "Dolo"
    .map((p) => p.replace(/\b\d{4,6}\b/g, ' ').replace(/\s+/g, ' ').trim())
    .map((p) => p.replace(/\s+\b[A-Z]{2}\b$/, '').replace(/^\b[A-Z]{2}\b\s+/, '').trim())
    .map((p) => p.replace(ADMIN_PREFIX, '').trim())
    .filter(Boolean);

  const candidates = cleaned.filter((p, i) => {
    const lc = p.toLowerCase();
    if (i === 0) return false;              // il primo segmento è il nome del locale o la via
    if (COUNTRIES.has(lc)) return false;
    if (REGIONS.has(lc)) return false;
    if (NEIGHBORHOODS.has(lc)) return false;
    if (ADMIN_BARE.test(p)) return false;
    if (STREET_PREFIX.test(p)) return false;
    if (/^[A-Z]{2}$/.test(p)) return false;
    if (/\d/.test(p)) return false;         // civici e numeri: mai un comune
    if (!/[a-zA-ZÀ-ÿ]{3,}/.test(p)) return false;
    return true;
  });
  if (!candidates.length) return null;
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
