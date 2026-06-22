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
      if (campaign.repeat === 'weekly') {
        // Ricorrente: riprogramma alla prossima settimana (avanza finché è nel futuro)
        // e lascia sent_at NULL, così tornerà a partire. recipients aggiorna l'ultimo invio.
        let next = new Date(campaign.scheduled_at).getTime();
        const now = Date.now();
        while (next <= now) next += 7 * 24 * 60 * 60 * 1000;
        await admin.from('notification_campaigns')
          .update({ scheduled_at: new Date(next).toISOString(), recipients }).eq('id', campaign.id);
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
  return NextResponse.json({ ok: true, processed: (due || []).length, sent });
}
