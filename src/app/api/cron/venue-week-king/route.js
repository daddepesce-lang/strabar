import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

// RE DELLA SETTIMANA — il lunedì mattina avvisa chi segue un locale di chi ha vinto la
// settimana appena chiusa. È il gancio che riporta la gente nello STESSO bar: una
// classifica che non si azzera mai non fa tornare nessuno, una che riparte ogni lunedì sì.
//
// Pensato per un cron (Vercel Cron), protetto da CRON_SECRET come gli altri:
//   /api/cron/venue-week-king?key=IL_SEGRETO
//
// EGRESS: una sola chiamata RPC che ritorna già aggregato tutto ciò che serve (re +
// follower per locale). Le notifiche sono insert, non letture.
//
// ANTI-SPAM, di proposito:
//  • solo locali con almeno 2 sessioni la settimana scorsa (un locale morto non notifica);
//  • una notifica per follower per locale, nessun invio a chi non segue nulla;
//  • al re diciamo che ha vinto, agli altri chi devono detronizzare.

export const runtime = 'nodejs';

const MIN_SESSIONS = 2;

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

  const { data, error } = await admin.rpc('venue_week_kings', { p_min_sessions: MIN_SESSIONS });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const venues = Array.isArray(data) ? data : [];
  const rows = [];
  for (const v of venues) {
    const followers = Array.isArray(v.followers) ? v.followers : [];
    if (!followers.length) continue;
    const link = `/locale/${encodeURIComponent(v.key)}`;
    for (const userId of followers) {
      const isKing = userId === v.kingUserId;
      rows.push({
        user_id: userId,
        // actor_id resta null: è l'app che parla, non una persona.
        actor_name: v.name || 'Strabar',
        type: 'venue_week_king',
        message: isKing
          ? `Sei tu il re della settimana da ${v.name} con ${v.units} unità. Difendi il trono 👑`
          : `Da ${v.name} il re della settimana è ${v.kingName} con ${v.units} unità. Vai a detronizzarlo 👑`,
        link,
      });
    }
  }

  if (!rows.length) return NextResponse.json({ ok: true, venues: venues.length, notified: 0 });

  // Un insert solo, a blocchi: niente una-chiamata-per-persona.
  let notified = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insErr } = await admin.from('notifications').insert(chunk);
    if (insErr) return NextResponse.json({ error: insErr.message, notified }, { status: 500 });
    notified += chunk.length;
  }

  return NextResponse.json({ ok: true, venues: venues.length, notified });
}
