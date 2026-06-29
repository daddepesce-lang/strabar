import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { siteUrl } from '@/lib/site';
import { computePrice, defaultOptions, describeOptions } from '@/lib/venuePricing';

export const runtime = 'nodejs';

// Checkout del CARRELLO: più servizi del locale in un solo pagamento Stripe.
// Crea N ordini (pending) + 1 sessione con N line items; il webhook li attiva tutti.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { venueKey, items } = body;
  if (!venueKey || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Carrello vuoto' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supa = createServerSupabase(cookieStore);
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Server non configurato' }, { status: 500 });
  const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const key = String(venueKey).trim().toLowerCase().replace(/\s+/g, ' ');

  const { data: claim } = await admin.from('venue_claims')
    .select('id, venue_name').eq('user_id', user.id).eq('venue_key', key).eq('status', 'approved').maybeSingle();
  if (!claim) return NextResponse.json({ error: 'Non sei un gestore approvato di questo locale' }, { status: 403 });

  const lineItems = [];
  const orderIds = [];

  for (const it of items.slice(0, 10)) {
    const { data: type } = await admin.from('venue_service_types').select('*').eq('id', it.serviceId).maybeSingle();
    if (!type) continue;
    const { data: ov } = await admin.from('venue_service_overrides').select('*').eq('venue_key', key).eq('service_type_id', it.serviceId).maybeSingle();
    const enabled = ov?.enabled != null ? ov.enabled : type.active;
    if (!enabled) continue;

    const svc = {
      code: type.code,
      price_cents: ov?.price_cents != null ? ov.price_cents : type.default_price_cents,
      pricing: ov?.pricing != null ? ov.pricing : type.pricing,
    };
    const options = { ...defaultOptions(type.code), ...(it.options || {}) };
    const amount = computePrice(svc, options);
    if (!amount || amount < 50) continue;

    if (type.code === 'sponsored_event') {
      if (!it.eventId) continue;
      const { data: ev } = await admin.from('events').select('id, host_id').eq('id', it.eventId).maybeSingle();
      if (!ev || ev.host_id !== user.id) continue;
    }

    const m = it.meta || {};
    const cleanMeta = {
      title: m.title ? String(m.title).slice(0, 120) : undefined,
      body: m.body ? String(m.body).slice(0, 400) : undefined,
      link: m.link ? String(m.link).slice(0, 300) : undefined,
      cta: m.cta ? String(m.cta).slice(0, 40) : undefined,
      message: m.message ? String(m.message).slice(0, 300) : undefined,
      image: m.image ? String(m.image).slice(0, 600) : undefined,
      extend_banner_id: m.extend_banner_id ? String(m.extend_banner_id).slice(0, 60) : undefined,
      options,
    };
    const optLabel = describeOptions(type.code, options);

    const { data: order, error: orderErr } = await admin.from('venue_orders').insert({
      venue_key: key, venue_name: claim.venue_name, user_id: user.id,
      service_type_id: type.id, service_code: type.code, status: 'pending',
      amount_cents: amount, currency: type.currency || 'eur', ref_id: it.eventId || null, meta: cleanMeta,
    }).select().single();
    if (orderErr || !order) continue;

    orderIds.push(order.id);
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: type.currency || 'eur',
        unit_amount: amount,
        product_data: { name: `${type.name} — ${claim.venue_name}${optLabel ? ` (${optLabel})` : ''}` },
      },
    });
  }

  if (!orderIds.length) return NextResponse.json({ error: 'Nessun articolo valido nel carrello' }, { status: 400 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Pagamenti non ancora configurati. Gli ordini sono registrati e verranno attivati manualmente." }, { status: 503 });
  }
  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      // Sull'estratto conto della carta comparirà "STRABAR" (non il nome legale del conto).
      payment_intent_data: { statement_descriptor: 'STRABAR' },
      success_url: siteUrl(`/locale/${encodeURIComponent(key)}/gestione?paid=1`),
      cancel_url: siteUrl(`/locale/${encodeURIComponent(key)}/gestione?canceled=1`),
      metadata: { order_ids: orderIds.join(',') },
    });
    await admin.from('venue_orders').update({ stripe_session_id: session.id }).in('id', orderIds);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: 'Errore Stripe: ' + (e.message || e) }, { status: 502 });
  }
}
