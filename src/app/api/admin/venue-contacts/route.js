import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';
import { googleVenueContact, GOOGLE_VENUES_ENABLED } from '@/lib/venues-google';
import { reserveGoogleCall } from '@/lib/api-quota';

// CRM contatti locali per l'outreach (tester, locandine, passaparola). Solo admin.
// GET  → elenco contatti + quali locali della directory NON sono ancora nel CRM.
// POST → { action:'seed' | 'update' | 'enrich' | 'delete' }

const EDITABLE = ['email', 'phone', 'instagram', 'website', 'address', 'status', 'notes', 'last_contacted_at', 'name', 'lat', 'lng'];

async function loadDirectory(admin) {
  // Riusa l'aggregazione SQL (stessa della directory pubblica).
  const { data, error } = await admin.rpc('get_venue_directory');
  if (error) return [];
  return data || [];
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [{ data: contacts, error }, directory] = await Promise.all([
    gate.admin.from('venue_contacts').select('*').order('updated_at', { ascending: false }),
    loadDirectory(gate.admin),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contactKeys = new Set((contacts || []).map((c) => c.key));
  // Locali attivi su Strabar non ancora nel CRM → candidati da aggiungere.
  const missing = (directory || [])
    .filter((v) => !contactKeys.has(v.key))
    .map((v) => ({ key: v.key, name: v.name, address: v.address, lat: v.lat, lng: v.lng, sessions: v.sessionsCount, verified: v.verified }));

  // Arricchisce i contatti con l'attività Strabar (presenze, verificato).
  const dirMap = {};
  (directory || []).forEach((v) => { dirMap[v.key] = v; });
  const enriched = (contacts || []).map((c) => ({
    ...c,
    sessions: dirMap[c.key]?.sessionsCount || 0,
    verified: dirMap[c.key]?.verified || false,
  }));

  return NextResponse.json({ contacts: enriched, missing, googleEnabled: GOOGLE_VENUES_ENABLED });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // Popola il CRM con TUTTI i locali attivi non ancora presenti (non sovrascrive gli esistenti).
  if (action === 'seed') {
    const directory = await loadDirectory(gate.admin);
    const { data: existing } = await gate.admin.from('venue_contacts').select('key');
    const have = new Set((existing || []).map((c) => c.key));
    const rows = (directory || [])
      .filter((v) => !have.has(v.key))
      .map((v) => ({ key: v.key, name: v.name, address: v.address || null, lat: v.lat, lng: v.lng, status: 'da_contattare' }));
    if (rows.length) {
      const { error } = await gate.admin.from('venue_contacts').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, added: rows.length });
  }

  // Aggiorna / crea un contatto.
  if (action === 'update') {
    const key = (body.key || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return NextResponse.json({ error: 'key mancante' }, { status: 400 });
    const row = { key, updated_at: new Date().toISOString() };
    EDITABLE.forEach((f) => { if (body[f] !== undefined) row[f] = body[f] === '' ? null : body[f]; });
    if (!row.name) row.name = key;
    const { error } = await gate.admin.from('venue_contacts').upsert(row, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Arricchisce telefono/sito da Google Places (on-demand, consuma quota).
  if (action === 'enrich') {
    const key = (body.key || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const name = body.name || key;
    if (!key) return NextResponse.json({ error: 'key mancante' }, { status: 400 });
    if (!GOOGLE_VENUES_ENABLED) return NextResponse.json({ error: 'Google non configurato' }, { status: 400 });
    const allowed = await reserveGoogleCall();
    if (!allowed) return NextResponse.json({ error: 'Quota Google esaurita per questo mese' }, { status: 429 });
    try {
      const near = typeof body.lat === 'number' && typeof body.lng === 'number' ? { lat: body.lat, lng: body.lng } : null;
      const info = await googleVenueContact(name, near);
      if (!info) return NextResponse.json({ ok: true, found: false });
      const patch = { key, updated_at: new Date().toISOString() };
      if (info.phone) patch.phone = info.phone;
      if (info.website) patch.website = info.website;
      if (info.address) patch.address = info.address;
      if (!body.name && info.name) patch.name = info.name;
      const { error } = await gate.admin.from('venue_contacts').upsert(patch, { onConflict: 'key' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, found: true, info });
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
    }
  }

  if (action === 'delete') {
    const key = (body.key || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return NextResponse.json({ error: 'key mancante' }, { status: 400 });
    const { error } = await gate.admin.from('venue_contacts').delete().eq('key', key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
}
