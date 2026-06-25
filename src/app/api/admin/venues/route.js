import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// GET /api/admin/venues — statistiche per locale (bar), aggregate dai check-in
// geolocalizzati delle sessioni. È la base dati per vendere pubblicità ai locali:
// quante presenze, quanti clienti unici, cosa si beve, in che fasce orarie e giorni.
//
// Nota sulla granularità: ogni sessione ha UN locale (location.name). I drink della
// sessione sono attribuiti a quel locale → preciso per le sessioni a locale singolo,
// approssimato per i giri con più tappe (manca il place_key per-drink, da introdurre).

const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

// Espande i drink in singole AGGIUNTE, ciascuna attribuita al suo locale:
//  1) added_places[i] (tappa precisa, salvata al momento dell'aggiunta);
//  2) place_name del drink (fallback per drink non ripetuti);
//  3) location.name della sessione (fallback per dati vecchi senza attribuzione).
function drinkAdds(s) {
  const fallbackName = s.location?.name || null;
  const fallbackKey = s.location?.placeKey || null;
  const out = [];
  (s.drinks || []).forEach((d) => {
    const times = Array.isArray(d.added_times) && d.added_times.length ? d.added_times : (d.added_at ? [d.added_at] : [s.created_at]);
    const places = Array.isArray(d.added_places) && d.added_places.length === times.length ? d.added_places : null;
    const n = times.length || 1;
    const qtyPer = (d.qty || n) / n; // di norma 1 per aggiunta
    times.forEach((t, i) => {
      const p = (places && places[i])
        || (d.place_name ? { key: d.place_key || null, name: d.place_name } : null)
        || (fallbackName ? { key: fallbackKey, name: fallbackName } : null);
      out.push({
        drink: d.name,
        placeName: p?.name || null,
        ms: new Date(t).getTime(),
        qty: qtyPer,
        units: (d.units || 0) * qtyPer,
      });
    });
  });
  return out;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: sessions, error } = await gate.admin
    .from('sessions')
    .select('id, user_id, total_units, drinks, created_at, location');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Solo check-in geolocalizzati validi (stessa regola di classifiche/dashboard).
  const geo = (sessions || []).filter((s) => {
    const loc = s.location;
    return loc && loc.name && !loc.freeform && !loc.unverified &&
      typeof loc.lat === 'number' && typeof loc.lng === 'number' && loc.share !== 'private';
  });

  const DOW = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const venues = {};

  const ensure = (key, displayName) => {
    if (!venues[key]) {
      venues[key] = {
        name: displayName, lat: null, lng: null,
        sessions: 0, units: 0, drinkCount: 0,
        users: new Set(),
        repeatUsers: {},     // user_id -> visite
        drinks: {},          // nome -> qty
        hours: new Array(24).fill(0),
        days: new Array(7).fill(0),
        lastSeen: 0,
      };
    }
    return venues[key];
  };

  geo.forEach((s) => {
    const adds = drinkAdds(s);
    const sessKey = s.location?.name ? norm(s.location.name) : null;

    // Locali "toccati" in questa sessione → 1 presenza + 1 cliente unico per ciascuno.
    const touched = new Map(); // key -> nome visualizzato
    adds.forEach((a) => { if (a.placeName) touched.set(norm(a.placeName), a.placeName); });
    if (touched.size === 0 && s.location?.name) touched.set(sessKey, s.location.name);

    const start = new Date(s.created_at).getTime();
    const dow = new Date(s.created_at).getDay();
    touched.forEach((displayName, key) => {
      const v = ensure(key, displayName);
      v.sessions += 1;
      v.users.add(s.user_id);
      v.repeatUsers[s.user_id] = (v.repeatUsers[s.user_id] || 0) + 1;
      if (start > v.lastSeen) v.lastSeen = start;
      v.days[dow] += 1;
      if (key === sessKey && typeof s.location.lat === 'number') { v.lat = s.location.lat; v.lng = s.location.lng; }
    });

    // Drink / unità / fasce orarie attribuiti al locale di OGNI aggiunta.
    adds.forEach((a) => {
      const key = a.placeName ? norm(a.placeName) : sessKey;
      if (!key || !venues[key]) return;
      const v = venues[key];
      v.drinkCount += a.qty;
      v.units += a.units;
      if (a.drink) v.drinks[a.drink] = (v.drinks[a.drink] || 0) + a.qty;
      const h = new Date(a.ms).getHours();
      if (h >= 0 && h < 24) v.hours[h] += a.qty;
    });
  });

  const list = Object.values(venues).map((v) => {
    const uniqueUsers = v.users.size;
    const repeat = Object.values(v.repeatUsers).filter((n) => n > 1).length;
    const topDrinks = Object.entries(v.drinks)
      .map(([name, qty]) => ({ name, qty: parseFloat(qty.toFixed(1)) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
    // Fascia oraria di picco: ora con più drink + finestra di 2h attorno.
    const peakHour = v.hours.reduce((best, c, i) => (c > v.hours[best] ? i : best), 0);
    const topDay = v.days.reduce((best, c, i) => (c > v.days[best] ? i : best), 0);
    return {
      name: v.name,
      lat: v.lat, lng: v.lng,
      sessions: v.sessions,
      uniqueUsers,
      repeatUsers: repeat,
      repeatRate: uniqueUsers ? Math.round((repeat / uniqueUsers) * 100) : 0,
      units: parseFloat(v.units.toFixed(1)),
      drinkCount: Math.round(v.drinkCount),
      avgUnits: v.sessions ? parseFloat((v.units / v.sessions).toFixed(1)) : 0,
      topDrinks,
      hours: v.hours.map((h) => Math.round(h)),
      peakHour,
      days: v.days,
      topDay: DOW[topDay],
      lastSeen: v.lastSeen ? new Date(v.lastSeen).toISOString() : null,
    };
  }).sort((a, b) => b.sessions - a.sessions || b.units - a.units);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totalVenues: list.length,
    totalGeoSessions: geo.length,
    venues: list,
  });
}
