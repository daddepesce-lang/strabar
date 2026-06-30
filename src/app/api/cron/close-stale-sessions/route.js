import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

// Chiude le sessioni "live" rimaste attive ma abbandonate (l'utente non ha premuto
// "Termina allenamento" e non riapre l'app, quindi l'auto-chiusura lato client non
// scatta mai). Pensato per un cron (Vercel Cron). Protetto da CRON_SECRET:
// chiama /api/cron/close-stale-sessions?key=IL_SEGRETO oppure header Authorization: Bearer.
//
// Regola: stesso comportamento dell'app (db.SESSION_AUTOCLOSE_HOURS = 5h dall'ULTIMO drink).
// Registra ended_at e duration = inizio→ultimo drink (durata onesta, l'inattività non conta).

const AUTOCLOSE_HOURS = 5;

function lastDrinkMs(session) {
  let last = new Date(session.created_at).getTime();
  for (const d of session.drinks || []) {
    const times = Array.isArray(d.added_times) && d.added_times.length
      ? d.added_times
      : (d.added_at ? [d.added_at] : []);
    for (const t of times) {
      const ms = new Date(t).getTime();
      if (Number.isFinite(ms) && ms > last) last = ms;
    }
  }
  return last;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const provided = url.searchParams.get('key') || (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supaUrl) return NextResponse.json({ error: 'Server non configurato' }, { status: 500 });
  const admin = createAdminSupabase(supaUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // EGRESS: solo le colonne necessarie, e solo le sessioni attive nate da oltre 5h
  // (una nata da meno non può essere idle da 5h). Tutto il resto si calcola qui.
  const cutoff = new Date(Date.now() - AUTOCLOSE_HOURS * 3600 * 1000).toISOString();
  const { data: actives, error } = await admin
    .from('sessions')
    .select('id, created_at, drinks')
    .eq('is_active', true)
    .lt('created_at', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  let closed = 0;
  for (const s of actives || []) {
    const last = lastDrinkMs(s);
    const idleHours = (now - last) / (3600 * 1000);
    if (idleHours < AUTOCLOSE_HOURS) continue; // ha aggiunto un drink di recente: ancora viva
    const created = new Date(s.created_at).getTime();
    const duration = Math.max(1, Math.round((last - created) / 60000));
    const { error: upErr } = await admin
      .from('sessions')
      .update({ is_active: false, ended_at: new Date(last).toISOString(), duration })
      .eq('id', s.id);
    if (!upErr) closed += 1;
  }

  return NextResponse.json({ ok: true, scanned: actives?.length || 0, closed });
}
