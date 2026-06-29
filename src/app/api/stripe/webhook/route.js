import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { activateVenueOrder } from '@/utils/venueActivate';

export const runtime = 'nodejs';

// Webhook Stripe: alla conferma del pagamento marca l'ordine pagato e ne applica l'effetto
// (evento sponsorizzato / promo / notifica). Richiede STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.
export async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !whSecret) return NextResponse.json({ error: 'Stripe non configurato' }, { status: 503 });

  const stripe = new Stripe(stripeKey);
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    return NextResponse.json({ error: `Firma non valida: ${e.message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Un ordine singolo (order_id) o più ordini da carrello (order_ids csv).
    const ids = [];
    if (session.metadata?.order_ids) session.metadata.order_ids.split(',').forEach((x) => x && ids.push(x.trim()));
    const single = session.metadata?.order_id || session.client_reference_id;
    if (single && !ids.includes(single)) ids.push(single);

    if (ids.length) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      for (const orderId of ids) {
        const { data: order } = await admin.from('venue_orders').select('*').eq('id', orderId).maybeSingle();
        // Idempotenza: applica l'effetto solo se non già attivo.
        if (order && order.status !== 'active') {
          try { await activateVenueOrder(admin, order); } catch (e) { console.error('Attivazione ordine fallita:', e.message || e); }
          await admin.from('venue_orders').update({
            status: 'active',
            paid_at: new Date().toISOString(),
            activated_at: new Date().toISOString(),
            stripe_payment_intent: session.payment_intent || null,
          }).eq('id', order.id);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
