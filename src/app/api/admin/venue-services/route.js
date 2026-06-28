import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// Catalogo servizi locali + override per-locale (prezzi/disponibilità diversi per locale).
//   GET                         → { types, overrides }
//   POST {kind:'type', ...}     → crea/aggiorna un servizio del catalogo
//   POST {kind:'override', ...} → imposta prezzo/abilitazione per un singolo locale
//   DELETE ?kind=type&id= | ?kind=override&id=

const TYPE_FIELDS = ['code', 'name', 'description', 'default_price_cents', 'currency', 'active', 'sort', 'pricing'];
const pick = (obj, fields) => fields.reduce((o, k) => (obj[k] !== undefined ? { ...o, [k]: obj[k] } : o), {});

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const [t, o] = await Promise.all([
    gate.admin.from('venue_service_types').select('*').order('sort', { ascending: true }),
    gate.admin.from('venue_service_overrides').select('*').order('created_at', { ascending: false }),
  ]);
  if (t.error) return NextResponse.json({ error: t.error.message }, { status: 500 });
  return NextResponse.json({ types: t.data || [], overrides: o.data || [] });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));

  if (body.kind === 'override') {
    if (!body.venue_key || !body.service_type_id) return NextResponse.json({ error: 'venue_key e service_type_id obbligatori' }, { status: 400 });
    const row = {
      venue_key: String(body.venue_key).trim().toLowerCase().replace(/\s+/g, ' '),
      service_type_id: body.service_type_id,
      price_cents: body.price_cents === '' || body.price_cents == null ? null : Number(body.price_cents),
      enabled: body.enabled == null ? null : !!body.enabled,
      pricing: body.pricing != null ? body.pricing : null,
    };
    const { data, error } = await gate.admin.from('venue_service_overrides')
      .upsert(row, { onConflict: 'venue_key,service_type_id' }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, override: data });
  }

  // default: catalogo servizio (type)
  const fields = pick(body, TYPE_FIELDS);
  if (body.id) {
    const { data, error } = await gate.admin.from('venue_service_types').update(fields).eq('id', body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, type: data });
  }
  if (!fields.code || !fields.name) return NextResponse.json({ error: 'code e name obbligatori' }, { status: 400 });
  const { data, error } = await gate.admin.from('venue_service_types').insert(fields).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, type: data });
}

export async function DELETE(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const table = kind === 'override' ? 'venue_service_overrides' : 'venue_service_types';
  const { error } = await gate.admin.from(table).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
