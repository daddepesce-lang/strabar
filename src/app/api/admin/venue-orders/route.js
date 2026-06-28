import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';
import { activateVenueOrder } from '@/utils/venueActivate';

// Ordini dei locali. GET = elenco; POST {id, action} = attiva (pagamento offline) / annulla.

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data, error } = await gate.admin.from('venue_orders').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!body.id || !['activate', 'cancel'].includes(body.action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 });
  }
  const { data: order, error } = await gate.admin.from('venue_orders').select('*').eq('id', body.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.action === 'cancel') {
    await gate.admin.from('venue_orders').update({ status: 'canceled' }).eq('id', order.id);
    return NextResponse.json({ ok: true });
  }

  // activate (pagamento offline): applica l'effetto e marca attivo.
  let result = null;
  try { result = await activateVenueOrder(gate.admin, order); } catch (e) { return NextResponse.json({ error: 'Attivazione fallita: ' + (e.message || e) }, { status: 500 }); }
  await gate.admin.from('venue_orders').update({ status: 'active', paid_at: order.paid_at || new Date().toISOString(), activated_at: new Date().toISOString() }).eq('id', order.id);
  return NextResponse.json({ ok: true, result });
}
