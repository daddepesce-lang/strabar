// Lettura SERVER-SIDE di una sessione condivisa, per il titolo e l'anteprima social di
// /share/[id]. Serve solo a far capire cosa c'è dietro il link prima di aprirlo.
//
// PRIVACY: la chiamata usa la chiave anon, quindi `auth.uid()` è NULL e la policy
// "Sessioni: visibili secondo privacy" lascia passare SOLO le sessioni pubbliche. Una
// sessione privata o tra amici torna semplicemente vuota e l'anteprima resta generica:
// non c'è modo di far trapelare qualcosa che l'utente non ha reso pubblico.
//
// EGRESS: risposta in cache per 5 minuti. Un link che gira in una chat viene "spiato" da
// WhatsApp, Telegram e dai client di ogni partecipante: senza cache sarebbe una lettura a
// testa, con la cache è una sola.

const CACHE_SECONDS = 300;

const FIELDS = [
  'id',
  'title',
  'total_units',
  'bac_level',
  'drinks',
  'created_at',
  'location',
  'profiles(display_name,username,use_username,alias,name_mode)',
].join(',');

/** La sessione PUBBLICA con quell'id, oppure null (inesistente o non pubblica). */
export async function getPublicSession(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !id) return null;
  // Gli id sono uuid: se non lo è, non interroghiamo nemmeno il DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/sessions?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(FIELDS)}&limit=1`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        next: { revalidate: CACHE_SECONDS, tags: [`session-${id}`] },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    // Cintura oltre alle bretelle: se un giorno la policy cambiasse, qui non pubblichiamo
    // comunque nulla che non sia esplicitamente pubblico.
    const share = row.location?.share;
    if (share && share !== 'public') return null;
    return row;
  } catch {
    return null;
  }
}

/** Numero di drink (somma delle quantità) di una sessione. */
export const drinkCount = (session) =>
  (session?.drinks || []).reduce((n, d) => n + (Number(d?.qty) || 1), 0);
