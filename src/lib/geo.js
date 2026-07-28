// Geometria di base condivisa (client E server): niente rete, solo matematica.
// Sta qui perché la usano sia la pagina percorsi (ordinamento per vicinanza) sia le
// pagine pubbliche renderizzate sul server (lunghezza del giro nei metadati).

/** Distanza in km tra due coordinate (formula dell'haversine). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Lunghezza di un percorso: somma delle distanze in linea d'aria tra tappe consecutive.
 * È indicativa (non stradale) — per la navigazione reale c'è Google Maps.
 */
export function routeTotalKm(waypoints = []) {
  if (waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const aLng = a?.lng ?? a?.lon;
    const bLng = b?.lng ?? b?.lon;
    if (a?.lat == null || aLng == null || b?.lat == null || bLng == null) continue;
    total += haversineKm(Number(a.lat), Number(aLng), Number(b.lat), Number(bLng));
  }
  return total;
}

/** Coordinate della PARTENZA (prima tappa con coordinate valide), o null. */
export function routeStart(route) {
  const wp = (route?.waypoints || []).find((w) => w?.lat != null && (w.lng ?? w.lon) != null);
  return wp ? { lat: Number(wp.lat), lng: Number(wp.lng ?? wp.lon) } : null;
}

/** Tempo di percorrenza stimato in minuti (4,5 km/h a piedi, 25 km/h in auto urbano). */
export function travelMinutes(km, mode = 'foot') {
  const speed = mode === 'foot' ? 4.5 : 25;
  return Math.max(1, Math.round((km / speed) * 60));
}
