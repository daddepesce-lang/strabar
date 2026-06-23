import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { sendCampaign } from '@/app/api/admin/notifications/route';

// Invia le campagne PROGRAMMATE arrivate a scadenza. Pensato per essere chiamato da un cron
// (Vercel Cron o Supabase pg_cron). Protetto da CRON_SECRET: imposta la variabile d'ambiente
// e chiama  /api/cron/run-campaigns?key=IL_SEGRETO  (oppure header Authorization: Bearer ...).
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

  // Campagne programmate, scadute e non ancora inviate
  const { data: due, error } = await admin
    .from('notification_campaigns')
    .select('*')
    .is('sent_at', null)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const campaign of due || []) {
    try {
      const recipients = await sendCampaign(admin, campaign);
      if (['daily', 'weekly', 'monthly'].includes(campaign.repeat)) {
        // Ricorrente: riprogramma alla prossima occorrenza (avanza finché è nel futuro),
        // lasciando sent_at NULL così tornerà a partire. recipients = ultimo invio.
        const next = new Date(campaign.scheduled_at);
        const now = Date.now();
        let guard = 0;
        while (next.getTime() <= now && guard++ < 1000) {
          if (campaign.repeat === 'daily') next.setDate(next.getDate() + 1);
          else if (campaign.repeat === 'weekly') next.setDate(next.getDate() + 7);
          else next.setMonth(next.getMonth() + 1); // monthly
        }
        await admin.from('notification_campaigns')
          .update({ scheduled_at: next.toISOString(), recipients }).eq('id', campaign.id);
      } else {
        // Una volta sola: marca come inviata e non riparte più.
        await admin.from('notification_campaigns')
          .update({ sent_at: new Date().toISOString(), recipients }).eq('id', campaign.id);
      }
      sent += 1;
    } catch (err) {
      console.error('Errore invio campagna programmata', campaign.id, err);
    }
  }

  // Rete di sicurezza: chiudi le sessioni "live" rimaste appese (is_active=true) quando
  // l'utente non ha più riaperto l'app per far scattare l'auto-chiusura client. Senza questo
  // restavano "live" all'infinito (es. visibili nel pannello admin). Coerente con i 4h
  // dall'ULTIMO drink usati da db.getActiveSession.
  let closedStale = 0;
  try {
    const { data: actives } = await admin
      .from('sessions')
      .select('id, created_at, drinks, feeling, description')
      .eq('is_active', true);
    const AUTOCLOSE_MS = 4 * 60 * 60 * 1000;
    const now = Date.now();
    const lastDrinkMs = (s) => {
      let last = new Date(s.created_at).getTime();
      (s.drinks || []).forEach((d) => {
        const times = Array.isArray(d.added_times) && d.added_times.length ? d.added_times : (d.added_at ? [d.added_at] : []);
        times.forEach((t) => { const ms = new Date(t).getTime(); if (Number.isFinite(ms) && ms > last) last = ms; });
      });
      return last;
    };
    for (const s of actives || []) {
      if (now - lastDrinkMs(s) < AUTOCLOSE_MS) continue;
      await admin.from('sessions').update({
        is_active: false,
        feeling: s.feeling || 'Sobrio',
        description: s.description || 'Chiusa automaticamente dopo 4 ore di inattività.',
        duration: Math.max(1, Math.round((now - new Date(s.created_at).getTime()) / 60000)),
      }).eq('id', s.id);
      closedStale += 1;
    }
  } catch (err) {
    console.error('Errore chiusura sessioni stale', err);
  }

  return NextResponse.json({ ok: true, processed: (due || []).length, sent, closedStale });
}
