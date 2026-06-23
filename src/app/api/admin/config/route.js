import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// Configurazione globale dell'app (riga singola 'singleton').
//   GET           → legge la config
//   PATCH {...}   → aggiorna (push_reminder_enabled, push_reminder_every)

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data, error } = await gate.admin.from('app_config').select('*').eq('id', 'singleton').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data || {} });
}

export async function PATCH(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const fields = { updated_at: new Date().toISOString() };
  if (typeof body.push_reminder_enabled === 'boolean') fields.push_reminder_enabled = body.push_reminder_enabled;
  if (body.push_reminder_every != null) fields.push_reminder_every = Math.max(1, Math.min(50, parseInt(body.push_reminder_every) || 3));

  // Catalogo drink gestito da admin. Accetta { quick, extra, beerFamilies } oppure null
  // per tornare al catalogo statico di default. Validazione minima della struttura.
  if ('drink_catalog' in body) {
    const dc = body.drink_catalog;
    if (dc === null) {
      fields.drink_catalog = null;
    } else if (dc && Array.isArray(dc.quick) && Array.isArray(dc.extra) && Array.isArray(dc.beerFamilies)) {
      fields.drink_catalog = dc;
    } else {
      return NextResponse.json({ error: 'drink_catalog non valido (servono quick, extra, beerFamilies come array).' }, { status: 400 });
    }
  }

  const { data, error } = await gate.admin
    .from('app_config')
    .upsert({ id: 'singleton', ...fields })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: data });
}
