import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// Gestione banner pubblicitari / partner dall'area admin.
//   GET            → elenco completo (anche non attivi)
//   POST           → crea banner
//   PATCH {id,...} → aggiorna campi (es. active, priority, testi)
//   DELETE ?id=    → elimina

const FIELDS = ['title', 'body', 'image_url', 'link_url', 'cta', 'partner', 'category', 'active', 'priority', 'starts_at', 'ends_at'];
const pick = (obj) => FIELDS.reduce((o, k) => (obj[k] !== undefined ? { ...o, [k]: obj[k] } : o), {});

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data, error } = await gate.admin
    .from('ad_banners')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banners: data || [] });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.title.trim()) return NextResponse.json({ error: 'Il titolo è obbligatorio' }, { status: 400 });
  const { data, error } = await gate.admin.from('ad_banners').insert(pick(body)).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, banner: data });
}

export async function PATCH(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { data, error } = await gate.admin.from('ad_banners').update(pick(body)).eq('id', body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, banner: data });
}

export async function DELETE(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { error } = await gate.admin.from('ad_banners').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
