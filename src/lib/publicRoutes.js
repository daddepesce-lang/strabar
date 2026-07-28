// Lettura SERVER-SIDE dei percorsi pubblici, per le pagine condivisibili/indicizzabili.
//
// EGRESS: stesso principio dell'API locali — chiamata REST diretta con la chiave anon e
// risposta messa in cache da Next (`next.revalidate`). Una query per percorso ogni ORA,
// non una per visitatore: cento persone che aprono lo stesso link su WhatsApp costano
// una singola lettura a Supabase. Il payload è la sola riga del percorso (piccola).
//
// PRIVACY: non filtriamo la visibilità qui a mano — ci pensa la RLS. Con la chiave anon
// `auth.uid()` è NULL, quindi la policy "Percorsi: visibili secondo privacy" restituisce
// SOLO i percorsi 'public': i 'friends' e i 'private' non escono da Supabase nemmeno per
// sbaglio. È la stessa regola che protegge l'app, non una copia che può divergere.

const REST = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
};

const CACHE_SECONDS = 3600; // 1 ora

/** Il percorso pubblico con quell'id, oppure null (inesistente, o non pubblico). */
export async function getPublicRoute(id) {
  const cfg = REST();
  if (!cfg || !id) return null;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/routes?id=eq.${encodeURIComponent(id)}&select=id,name,description,waypoints,visibility,created_at,starts_count,completions_count&limit=1`,
      {
        headers: { apikey: cfg.anon, Authorization: `Bearer ${cfg.anon}` },
        next: { revalidate: CACHE_SECONDS, tags: ['public-routes'] },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const route = Array.isArray(rows) ? rows[0] : null;
    // Cintura oltre alle bretelle: se un giorno la policy cambiasse, qui non pubblichiamo
    // comunque nulla che non sia esplicitamente pubblico.
    if (!route || (route.visibility && route.visibility !== 'public')) return null;
    return route;
  } catch {
    return null;
  }
}

/**
 * Tutti i percorsi pubblici (cap 200), per le pagine città e la sitemap.
 * Una sola query condivisa da tutte quelle pagine, in cache per un'ora.
 */
export async function getPublicRoutes() {
  const cfg = REST();
  if (!cfg) return [];
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/routes?visibility=eq.public&select=id,name,description,waypoints,created_at,starts_count,completions_count&order=created_at.desc&limit=200`,
      {
        headers: { apikey: cfg.anon, Authorization: `Bearer ${cfg.anon}` },
        next: { revalidate: CACHE_SECONDS, tags: ['public-routes'] },
      }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
