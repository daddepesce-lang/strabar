// Ridà le COORDINATE alle sessioni vecchie che hanno solo il nome del locale.
//
// Il caso: le sessioni registrate a posteriori salvavano `location = { name: "Pacelli" }`
// e basta. Nel dettaglio sessione la mappa non compariva (senza coordinate non c'è niente
// da disegnare), ma il pulsante "Apri in Maps" sì, perché a lui basta il nome. Da oggi il
// form suggerisce locali veri con coordinate; questo script sistema lo storico.
//
// PERCHÉ È PIENO DI GUARDIE: alla prima prova "Pacelli" è stato risolto come
// Pacellistraße, a Monaco di Baviera. Un nome nudo cercato su una mappa del mondo trova
// quasi sempre QUALCOSA, e quel qualcosa è spesso a mille chilometri. Una mappa sbagliata
// è peggio di nessuna mappa: quindi un risultato viene accettato solo se
//   • sta nel paese giusto (--country, default it);
//   • NON è una strada, un confine, una città o una regione (deve essere un posto);
//   • è entro --max-km (default 120) da dove quella persona beve di solito, calcolato
//     sulle SUE altre sessioni geolocalizzate. Senza un ancoraggio, non si scrive nulla.
//
// E una regola in più, non negoziabile: ogni sessione toccata viene marcata
// `unverified: true`. Una coordinata trovata a posteriori non è una prova che quella
// persona fosse lì: senza questa riga lo script gonfierebbe le classifiche dei locali.
//
// Uso (dalla radice del progetto):
//   node --env-file=.env.local scripts/geocode-legacy-sessions.mjs            # prova a vuoto
//   node --env-file=.env.local scripts/geocode-legacy-sessions.mjs --apply    # scrive
//   ... --limit=50         quante sessioni al massimo considerare (default 500)
//   ... --name="Pacelli"   agisci solo sulle sessioni di UN locale
//   ... --max-km=60        quanto lontano può stare il risultato dalla zona dell'utente
//   ... --country=it       paese a cui limitare la ricerca (vuoto = nessun limite)

const APPLY = process.argv.includes('--apply');
const argOf = (flag, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const LIMIT = parseInt(argOf('limit', '500'), 10);
const ONLY_NAME = argOf('name', '');
const MAX_KM = parseFloat(argOf('max-km', '120'));
const COUNTRY = argOf('country', 'it');

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SERVICE_KEY) {
  console.error('Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lngOf = (l) => (l?.lng ?? l?.lon);

const distKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

// Categorie OSM che NON sono un locale: una via, un confine amministrativo, un comune.
// Sono esattamente ciò che si becca cercando un cognome ("Pacelli" → Pacellistraße).
const BAD_CLASS = new Set(['highway', 'boundary', 'place', 'landuse', 'waterway', 'railway', 'natural']);

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 1. Sessioni da sistemare: hanno un nome di locale ma nessuna coordinata.
//    Le sessioni libere (freeform) non hanno un locale: per loro non c'è niente da cercare.
async function loadSessions() {
  const rows = await rest(
    `sessions?select=id,user_id,location,created_at&location->>name=not.is.null&order=created_at.desc&limit=${LIMIT * 4}`
  );
  return (rows || [])
    .filter((s) => {
      const l = s.location || {};
      if (!l.name) return false;
      if (l.freeform) return false;
      return l.lat == null || lngOf(l) == null;
    })
    .filter((s) => !ONLY_NAME || norm(s.location.name) === norm(ONLY_NAME))
    .slice(0, LIMIT);
}

// 2. Dove beve di solito ciascuno: la media delle sue sessioni GEOLOCALIZZATE.
//    È l'ancora che tiene il geocoding coi piedi per terra.
async function loadAnchors(userIds) {
  const anchors = new Map();
  if (!userIds.length) return anchors;
  const list = userIds.map((u) => `"${u}"`).join(',');
  const rows = await rest(
    `sessions?select=user_id,location&user_id=in.(${list})&location->>lat=not.is.null&limit=2000`
  );
  const acc = new Map();
  for (const r of rows || []) {
    const lat = Number(r.location?.lat), lng = Number(lngOf(r.location));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!acc.has(r.user_id)) acc.set(r.user_id, { lat: 0, lng: 0, n: 0 });
    const a = acc.get(r.user_id);
    a.lat += lat; a.lng += lng; a.n += 1;
  }
  for (const [uid, a] of acc) anchors.set(uid, { lat: a.lat / a.n, lng: a.lng / a.n, n: a.n });
  return anchors;
}

// 3. Directory dei locali Strabar: la fonte gratuita e migliore (sono posti dove qualcuno
//    ha davvero fatto un check-in col GPS acceso).
async function loadDirectory() {
  const rows = await fetch(`${URL_BASE}/rest/v1/rpc/get_venue_directory`, {
    method: 'POST', headers, body: '{}',
  }).then((r) => (r.ok ? r.json() : []));
  const map = new Map();
  for (const v of rows || []) {
    if (v.lat != null && v.lng != null) map.set(norm(v.key || v.name), v);
  }
  return map;
}

// 4. Solo per i nomi rimasti: Nominatim, una richiesta al secondo, ristretto alla zona
//    dell'utente e al paese. Restituisce il primo risultato PLAUSIBILE.
async function geocodeOsm(name, anchor) {
  const params = new URLSearchParams({
    q: name, format: 'jsonv2', limit: '5', addressdetails: '1', 'accept-language': 'it',
  });
  if (COUNTRY) params.set('countrycodes', COUNTRY);
  if (anchor) {
    const d = 1.0; // ~100 km di riquadro attorno alla zona dell'utente
    params.set('viewbox', `${anchor.lng - d},${anchor.lat - d},${anchor.lng + d},${anchor.lat + d}`);
    params.set('bounded', '1');
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Strabar/1.0 (geocode-legacy-sessions)' },
  });
  if (!res.ok) return null;
  const hits = await res.json();
  for (const hit of hits || []) {
    if (BAD_CLASS.has(hit.category || hit.class)) continue;
    const lat = Number(hit.lat), lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (anchor) {
      const km = distKm(anchor.lat, anchor.lng, lat, lng);
      if (km > MAX_KM) continue;
    }
    return { lat, lng, address: hit.display_name || '', what: `${hit.category || hit.class}/${hit.type}` };
  }
  return null;
}

async function main() {
  console.log(APPLY ? '── SCRITTURA ATTIVA ──' : '── PROVA A VUOTO (aggiungi --apply per scrivere) ──');
  console.log(`Paese: ${COUNTRY || 'qualsiasi'} · distanza massima dalla zona dell'utente: ${MAX_KM} km\n`);

  const sessions = await loadSessions();
  console.log(`Sessioni senza coordinate: ${sessions.length}`);
  if (!sessions.length) return;

  const [directory, anchors] = await Promise.all([
    loadDirectory(),
    loadAnchors([...new Set(sessions.map((s) => s.user_id).filter(Boolean))]),
  ]);

  // Stesso nome + stesso utente = una sola ricerca, anche se le sessioni sono dieci.
  const groups = new Map();
  for (const s of sessions) {
    const k = `${s.user_id}|${norm(s.location.name)}`;
    if (!groups.has(k)) groups.set(k, { name: s.location.name, user_id: s.user_id, sessions: [] });
    groups.get(k).sessions.push(s);
  }
  console.log(`Da risolvere: ${groups.size} coppie locale/utente\n`);

  let fromDir = 0, fromOsm = 0, noAnchor = 0, unresolved = 0, updated = 0;

  for (const entry of groups.values()) {
    const anchor = anchors.get(entry.user_id) || null;
    const dirHit = directory.get(norm(entry.name)) || null;

    let found = null;
    let source = '';

    if (dirHit) {
      const km = anchor ? distKm(anchor.lat, anchor.lng, Number(dirHit.lat), Number(dirHit.lng)) : null;
      if (km == null || km <= MAX_KM) {
        found = { lat: Number(dirHit.lat), lng: Number(dirHit.lng), address: dirHit.address || '', what: 'strabar' };
        source = 'directory';
        fromDir++;
      }
    }

    if (!found) {
      // Senza ancora non si scrive: sarebbe un tiro al buio sulla mappa del mondo.
      if (!anchor) {
        noAnchor++;
        console.log(`  ? ${entry.name} — nessuna sessione geolocalizzata di questo utente: salto (${entry.sessions.length} sessioni)`);
        continue;
      }
      await sleep(1100); // policy Nominatim: max 1 richiesta al secondo
      found = await geocodeOsm(entry.name, anchor);
      source = 'osm';
      if (found) fromOsm++;
    }

    if (!found) {
      unresolved++;
      console.log(`  ✗ ${entry.name} — nessuna corrispondenza plausibile (${entry.sessions.length} sessioni)`);
      continue;
    }

    const km = anchor ? distKm(anchor.lat, anchor.lng, found.lat, found.lng).toFixed(0) : '?';
    console.log(`  ✓ ${entry.name} → ${found.lat.toFixed(5)}, ${found.lng.toFixed(5)} [${source}: ${found.what}, ${km} km da casa] (${entry.sessions.length} sessioni)`);
    if (!APPLY) continue;

    for (const s of entry.sessions) {
      const location = {
        ...s.location,
        lat: found.lat,
        lng: found.lng,
        ...(found.address && !s.location.address ? { address: found.address } : {}),
        // Coordinate ricostruite a posteriori: mai spacciarle per una presenza provata.
        unverified: true,
        geocoded: true,
      };
      await rest(`sessions?id=eq.${s.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ location }),
      });
      updated++;
    }
  }

  console.log('\nRiepilogo');
  console.log(`  risolti dalla directory Strabar: ${fromDir}`);
  console.log(`  risolti da OpenStreetMap:        ${fromOsm}`);
  console.log(`  saltati (utente senza zona):     ${noAnchor}`);
  console.log(`  non risolti:                     ${unresolved}`);
  console.log(APPLY ? `  sessioni aggiornate:             ${updated}` : '  (prova a vuoto: nessuna scrittura)');
}

main().catch((err) => {
  console.error('Errore:', err.message || err);
  process.exit(1);
});
