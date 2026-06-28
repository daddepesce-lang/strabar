import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

// Crea una sessione di pagamento Stripe per un servizio del locale.
// Verifica: utente loggato + gestore APPROVATO del locale. Calcola il prezzo effettivo
// (override per-locale o default del catalogo) lato server (mai fidarsi del client).
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { venueKey, serviceId, eventId, meta } = body;
  if (!venueKey || !serviceId) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 });

  // 1) Utente
  const cookieStore = await cookies();
  const supa = createServerSupabase(cookieStore);
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });

  // 2) Service role per verifiche + scrittura ordine
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Server non configurato' }, { status: 500 });
  const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const key = String(venueKey).trim().toLowerCase().replace(/\s+/g, ' ');

  // 3) Gestore approvato?
  const { data: claim } = await admin.from('venue_claims')
    .select('id, venue_name').eq('user_id', user.id).eq('venue_key', key).eq('status', 'approved').maybeSingle();
  if (!claim) return NextResponse.json({ error: 'Non sei un gestore approvato di questo locale' }, { status: 403 });

  // 4) Servizio + prezzo effettivo
  const { data: type } = await admin.from('venue_service_types').select('*').eq('id', serviceId).maybeSingle();
  if (!type) return NextResponse.json({ error: 'Servizio inesistente' }, { status: 404 });
  const { data: ov } = await admin.from('venue_service_overrides').select('*').eq('venue_key', key).eq('service_type_id', serviceId).maybeSingle();
  const enabled = ov?.enabled != null ? ov.enabled : type.active;
  if (!enabled) return NextResponse.json({ error: 'Servizio non disponibile per questo locale' }, { status: 400 });
  const amount = ov?.price_cents != null ? ov.price_cents : type.default_price_cents;
  if (!amount || amount < 50) return NextResponse.json({ error: 'Prezzo non valido' }, { status: 400 });

  // 5) Validazioni specifiche
  if (type.code === 'sponsored_event') {
    if (!eventId) return NextResponse.json({ error: 'Scegli un evento da sponsorizzare' }, { status: 400 });
    const { data: ev } = await admin.from('events').select('id, host_id').eq('id', eventId).maybeSingle();
    if (!ev || ev.host_id !== user.id) return NextResponse.json({ error: 'Evento non valido' }, { status: 400 });
  }

  // 6) Crea l'ordine (pending)
  const cleanMeta = (() => {
    const m = meta || {};
    return {
      title: m.title ? String(m.title).slice(0, 120) : undefined,
      body: m.body ? String(m.body).slice(0, 400) : undefined,
      link: m.link ? String(m.link).slice(0, 300) : undefined,
      cta: m.cta ? String(m.cta).slice(0, 40) : undefined,
      message: m.message ? String(m.message).slice(0, 300) : undefined,
    };
  })();
  const { data: order, error: orderErr } = await admin.from('venue_orders').insert({
    venue_key: key, venue_name: claim.venue_name, user_id: user.id,
    service_type_id: type.id, service_code: type.code, status: 'pending',
    amount_cents: amount, currency: type.currency || 'eur', ref_id: eventId || null, meta: cleanMeta,
  }).select().single();
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // 7) Stripe Checkout (assente → ordine resta pending, attivabile a mano da /admin)
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Pagamenti non ancora configurati. L\'ordine è stato registrato: verrà attivato manualmente.' }, { status: 503 });
  }
  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: type.currency || 'eur',
          unit_amount: amount,
          product_data: { name: `${type.name} — ${claim.venue_name}` },
        },
      }],
      success_url: siteUrl(`/locale/${encodeURIComponent(key)}/gestione?paid=1`),
      cancel_url: siteUrl(`/locale/${encodeURIComponent(key)}/gestione?canceled=1`),
      metadata: { order_id: order.id },
      client_reference_id: order.id,
    });
    await admin.from('venue_orders').update({ stripe_session_id: session.id }).eq('id', order.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: 'Errore Stripe: ' + (e.message || e) }, { status: 502 });
  }
}
