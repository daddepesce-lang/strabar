// Applica l'EFFETTO di un ordine locale pagato/attivato. Usato sia dal webhook Stripe
// (pagamento andato a buon fine) sia dall'attivazione manuale da /admin (pagamento
// offline). `admin` è un client Supabase con SERVICE ROLE.
//
//  • sponsored_event → l'evento collegato va in cima alla lista (sponsored) fino al giorno dopo
//  • promo           → crea un banner nel feed (ad_banners) coi testi forniti
//  • notify          → notifica i clienti che hanno già brindato nel locale E hanno dato
//                      il consenso marketing (commerciale → richiede opt-in)

const normKey = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function activateVenueOrder(admin, order) {
  const code = order.service_code;
  const meta = order.meta || {};

  if (code === 'sponsored_event' && order.ref_id) {
    let until = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const { data: ev } = await admin.from('events').select('date').eq('id', order.ref_id).maybeSingle();
    if (ev?.date) { const d = new Date(ev.date); d.setDate(d.getDate() + 1); until = d; }
    await admin.from('events')
      .update({ sponsored: true, sponsor_venue_key: order.venue_key, sponsor_until: until.toISOString() })
      .eq('id', order.ref_id);
    return { applied: 'sponsored_event' };
  }

  if (code === 'promo') {
    await admin.from('ad_banners').insert({
      title: meta.title || order.venue_name || 'Promo',
      body: meta.body || null,
      link_url: meta.link || null,
      cta: meta.cta || 'Scopri',
      partner: order.venue_name || null,
      category: 'partner',
      active: true,
      priority: 5,
    });
    return { applied: 'promo' };
  }

  if (code === 'notify') {
    const key = order.venue_key;
    // Clienti che hanno un check-in verificato in questo locale.
    const { data: sessions } = await admin.from('sessions').select('user_id, location').limit(5000);
    const visitorIds = [...new Set((sessions || []).filter((s) => {
      const l = s.location || {};
      return l.name && !l.freeform && !l.unverified && typeof l.lat === 'number' && normKey(l.name) === key;
    }).map((s) => s.user_id))];
    if (!visitorIds.length) return { applied: 'notify', recipients: 0 };
    // Solo chi ha dato il consenso marketing (notifica commerciale).
    const { data: profs } = await admin.from('profiles').select('id').in('id', visitorIds).eq('marketing_consent', true);
    const recipients = (profs || []).map((p) => p.id);
    if (!recipients.length) return { applied: 'notify', recipients: 0 };
    const msg = (meta.message || `Novità da ${order.venue_name || 'un locale'}! 🍻`).slice(0, 300);
    const link = meta.link || `/locale/${encodeURIComponent(key)}`;
    const rows = recipients.map((uid) => ({ user_id: uid, type: 'venue_promo', message: msg, link, actor_name: order.venue_name || null }));
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from('notifications').insert(rows.slice(i, i + 500));
    }
    return { applied: 'notify', recipients: recipients.length };
  }

  return { applied: null };
}
