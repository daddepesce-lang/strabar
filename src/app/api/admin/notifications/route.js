import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// Gestione campagne di notifica (broadcast) dall'area admin.
//   GET                 → elenco campagne
//   POST {action:'send'}→ invio immediato (inserisce notifiche + push) e crea la campagna come inviata
//   POST                → crea una campagna programmata/bozza (scheduled_at)
//   DELETE ?id=         → elimina una campagna

// Risolve gli ID dei destinatari secondo il target, escludendo chi ha disattivato le promo.
export async function resolveRecipients(admin, target) {
  const { data: profiles } = await admin.from('profiles').select('id, is_premium, notif_prefs');
  let ids = (profiles || []).filter((p) => (p.notif_prefs?.promo ?? true) !== false);

  if (target === 'premium') ids = ids.filter((p) => p.is_premium);
  if (target === 'active7d') {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sess } = await admin.from('sessions').select('user_id').gte('created_at', since);
    const active = new Set((sess || []).map((s) => s.user_id));
    ids = ids.filter((p) => active.has(p.id));
  }
  return ids.map((p) => p.id);
}

// Esegue l'invio: inserisce una notifica per ogni destinatario + invia il push. Best effort.
export async function sendCampaign(admin, campaign) {
  const recipients = await resolveRecipients(admin, campaign.target || 'all');
  if (recipients.length > 0) {
    const rows = recipients.map((uid) => ({
      user_id: uid,
      actor_name: 'Strabar',
      type: 'promo',
      message: campaign.message,
      link: campaign.link || '/',
    }));
    // Inserimento a blocchi per non superare i limiti della richiesta
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from('notifications').insert(rows.slice(i, i + 500));
    }
    try {
      await admin.functions.invoke('send-push', {
        body: { user_ids: recipients, title: campaign.title || 'Strabar 🍻', body: campaign.message, url: campaign.link || '/' },
      });
    } catch { /* edge function non disponibile: ignora */ }
  }
  return recipients.length;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data, error } = await gate.admin
    .from('notification_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const { action, title, message, link, target, scheduledAt } = body;
  if (!message || !message.trim()) return NextResponse.json({ error: 'Il messaggio è obbligatorio' }, { status: 400 });

  const base = {
    title: title || null,
    message: message.trim(),
    link: link || null,
    target: target || 'all',
    created_by: gate.user.id,
  };

  if (action === 'send') {
    const { data: campaign, error } = await gate.admin
      .from('notification_campaigns')
      .insert({ ...base, sent_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const recipients = await sendCampaign(gate.admin, campaign);
    await gate.admin.from('notification_campaigns').update({ recipients }).eq('id', campaign.id);
    return NextResponse.json({ ok: true, recipients });
  }

  // Campagna programmata (verrà inviata dal cron) o bozza
  const { data, error } = await gate.admin
    .from('notification_campaigns')
    .insert({ ...base, scheduled_at: scheduledAt || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: data });
}

export async function DELETE(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { error } = await gate.admin.from('notification_campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
