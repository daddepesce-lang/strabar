// Prenotazione atomica di una chiamata Google Places entro la quota gratuita mensile.
// USO SOLO LATO SERVER (service role). Vedi migration api_usage_quota.
import { createClient } from '@supabase/supabase-js';

const SERVICE = 'google_places';
// Sotto il free tier Google (~10k/mese per SKU). Alzabile via env se monitori i costi.
const DEFAULT_MONTHLY_LIMIT = 9000;

function monthlyLimit() {
  const n = parseInt(process.env.GOOGLE_PLACES_MONTHLY_LIMIT || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT;
}

// Periodo di conteggio = mese UTC. Cambiando mese la RPC parte da una riga nuova (reset).
function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// true  → slot prenotato: puoi usare Google (conteggio incrementato).
// false → quota esaurita o server non configurato: usa il fallback OSM.
export async function reserveGoogleCall() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false; // senza service role non possiamo contare: resta su OSM
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.rpc('reserve_api_call', {
    p_service: SERVICE,
    p_period: currentPeriod(),
    p_limit: monthlyLimit(),
  });
  if (error) {
    console.warn('reserve_api_call fallita:', error.message || error);
    return false;
  }
  return data === true;
}
