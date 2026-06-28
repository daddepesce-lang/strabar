import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// Richieste di gestione locale (claim). GET = elenco; POST {id, action, admin_note} = approva/rifiuta.

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data: claims, error } = await gate.admin
    .from('venue_claims').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Profili dei richiedenti (nome/username/email) per la UI.
  const ids = [...new Set((claims || []).map((c) => c.user_id))];
  let profMap = {};
  if (ids.length) {
    const { data: profs } = await gate.admin.from('profiles').select('id, display_name, username').in('id', ids);
    (profs || []).forEach((p) => { profMap[p.id] = p; });
  }
  return NextResponse.json({ claims: (claims || []).map((c) => ({ ...c, requester: profMap[c.user_id] || null })) });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!body.id || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 });
  }
  const status = body.action === 'approve' ? 'approved' : 'rejected';
  const { data: claim, error } = await gate.admin.from('venue_claims')
    .update({ status, admin_note: body.admin_note || null, resolved_at: new Date().toISOString() })
    .eq('id', body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Un locale con gestore approvato diventa anche VERIFICATO nel registro (badge ✓ +
  // può vendere servizi). Best-effort: non bloccare l'approvazione se fallisce.
  if (status === 'approved') {
    try {
      await gate.admin.from('venues').upsert(
        { key: claim.venue_key, name: claim.venue_name, verified: true, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    } catch { /* noop */ }
  }

  // Notifica al richiedente l'esito.
  try {
    await gate.admin.from('notifications').insert({
      user_id: claim.user_id,
      type: 'venue_claim',
      message: status === 'approved'
        ? `✅ Sei ora gestore di "${claim.venue_name}" su Strabar!`
        : `La richiesta di gestione per "${claim.venue_name}" non è stata approvata.`,
      link: `/locale/${encodeURIComponent(claim.venue_key)}/gestione`,
    });
  } catch { /* notifica best-effort */ }

  return NextResponse.json({ ok: true, claim });
}
