// Applica l'EFFETTO di un ordine locale pagato/attivato. Usato sia dal webhook Stripe
// sia dall'attivazione manuale da /admin. `admin` = client Supabase con SERVICE ROLE.
//
//  • sponsored_event → evento in cima a /events (+ card nel feed se Spotlight+)
//  • promo           → banner nel feed per N giorni, posizione feed/cima
//  • notify          → notifica ai clienti secondo la fascia di pubblico scelta,
//                      SEMPRE limitata a chi ha dato il consenso marketing

const normKey = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const DAY = 24 * 3600 * 1000;

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function activateVenueOrder(admin, order) {
  const code = order.service_code;
  const meta = order.meta || {};
  const opt = meta.options || {};
  const key = order.venue_key;

  if (code === 'sponsored_event' && order.ref_id) {
    let until = new Date(Date.now() + 30 * DAY);
    const { data: ev } = await admin.from('events').select('date, title').eq('id', order.ref_id).maybeSingle();
    if (ev?.date) { const d = new Date(ev.date); d.setDate(d.getDate() + 1); until = d; }
    await admin.from('events')
      .update({ sponsored: true, sponsor_venue_key: key, sponsor_until: until.toISOString() })
      .eq('id', order.ref_id);
    // Spotlight+: anche una card nel feed fino alla data dell'evento.
    if (opt.spotlight) {
      await admin.from('ad_banners').insert({
        title: `⭐ ${ev?.title || 'Evento'} — ${order.venue_name || ''}`.trim(),
        body: 'Evento in evidenza su Strabar', link_url: `/events/${order.ref_id}`,
        cta: 'Partecipa', partner: order.venue_name || null, category: 'partner',
        active: true, priority: 8, ends_at: until.toISOString(),
      });
    }
    return { applied: 'sponsored_event' };
  }

  if (code === 'promo') {
    const days = Number(opt.days) || 7;
    const endsAt = new Date(Date.now() + days * DAY).toISOString();
    await admin.from('ad_banners').insert({
      title: meta.title || order.venue_name || 'Promo',
      body: meta.body || null,
      link_url: meta.link || `/locale/${encodeURIComponent(key)}`,
      cta: meta.cta || 'Scopri',
      partner: order.venue_name || null,
      category: 'partner',
      active: true,
      priority: opt.position === 'top' ? 10 : 5,
      ends_at: endsAt,
    });
    return { applied: 'promo', days };
  }

  if (code === 'notify') {
    const audience = opt.audience || 'venue';
    const since30 = Date.now() - 30 * DAY;
    let recipientIds = [];

    if (audience === 'all') {
      const { data: profs } = await admin.from('profiles').select('id').eq('marketing_consent', true);
      recipientIds = (profs || []).map((p) => p.id);
    } else {
      // Servono le sessioni: filtriamo per locale / recenti / vicinanza.
      const { data: sessions } = await admin.from('sessions').select('user_id, location, created_at').limit(8000);
      const valid = (s) => { const l = s.location || {}; return l.name && !l.freeform && !l.unverified && typeof l.lat === 'number'; };
      let coords = null;
      if (audience === 'nearby') {
        const { data: v } = await admin.from('venues').select('lat, lng').eq('key', key).maybeSingle();
        if (v?.lat != null) coords = { lat: v.lat, lng: v.lng };
        if (!coords) { const hit = (sessions || []).find((s) => valid(s) && normKey(s.location.name) === key); if (hit) coords = { lat: hit.location.lat, lng: hit.location.lng }; }
      }
      const radius = 3000; // 3 km
      const set = new Set();
      (sessions || []).forEach((s) => {
        if (!valid(s)) return;
        const ts = new Date(s.created_at).getTime();
        if (audience === 'venue') {
          if (normKey(s.location.name) === key) set.add(s.user_id);
        } else if (audience === 'recent30') {
          if (normKey(s.location.name) === key && ts >= since30) set.add(s.user_id);
        } else if (audience === 'nearby' && coords) {
          if (ts >= since30 && distM(coords.lat, coords.lng, s.location.lat, s.location.lng) <= radius) set.add(s.user_id);
        }
      });
      const ids = [...set];
      if (ids.length) {
        // solo consenso marketing
        const { data: profs } = await admin.from('profiles').select('id').in('id', ids).eq('marketing_consent', true);
        recipientIds = (profs || []).map((p) => p.id);
      }
    }

    if (!recipientIds.length) return { applied: 'notify', recipients: 0 };
    const msg = (meta.message || `Novità da ${order.venue_name || 'un locale'}! 🍻`).slice(0, 300);
    const link = meta.link || `/locale/${encodeURIComponent(key)}`;
    const rows = recipientIds.map((uid) => ({ user_id: uid, type: 'venue_promo', message: msg, link, actor_name: order.venue_name || null }));
    for (let i = 0; i < rows.length; i += 500) await admin.from('notifications').insert(rows.slice(i, i + 500));
    return { applied: 'notify', recipients: recipientIds.length };
  }

  return { applied: null };
}
