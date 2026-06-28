import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';
import { sendVenueApprovalEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';

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

  // Collega manualmente un ACCOUNT (per email) a un locale: lo rende account_type='venue'
  // e crea/aggiorna un claim approvato. Usato quando il locale si è registrato dopo l'email.
  if (body.action === 'link_account') {
    const email = (body.email || '').trim();
    const venueKey = (body.venue_key || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const venueName = body.venue_name || venueKey;
    if (!email || !venueKey) return NextResponse.json({ error: 'email e venue_key obbligatori' }, { status: 400 });
    const { data: uid, error: findErr } = await gate.admin.rpc('admin_find_user_id', { p_email: email });
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
    if (!uid) return NextResponse.json({ error: 'Nessun account Strabar con questa email. Chiedi al locale di registrarsi prima.' }, { status: 404 });
    await gate.admin.from('profiles').update({ account_type: 'venue' }).eq('id', uid);
    // collega: aggiorna un claim esistente (lead) o creane uno approvato
    const { data: existing } = await gate.admin.from('venue_claims').select('id').eq('venue_key', venueKey).or(`user_id.is.null,user_id.eq.${uid}`).limit(1);
    if (existing && existing.length) {
      await gate.admin.from('venue_claims').update({ user_id: uid, status: 'approved', venue_name: venueName, resolved_at: new Date().toISOString() }).eq('id', existing[0].id);
    } else {
      await gate.admin.from('venue_claims').insert({ venue_key: venueKey, venue_name: venueName, user_id: uid, status: 'approved', resolved_at: new Date().toISOString() });
    }
    await gate.admin.from('venues').upsert({ key: venueKey, name: venueName, verified: true, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    try { await gate.admin.from('notifications').insert({ user_id: uid, type: 'venue_claim', message: `✅ Il tuo account è collegato a "${venueName}"`, link: `/locale/${encodeURIComponent(venueKey)}/gestione` }); } catch { /* noop */ }
    return NextResponse.json({ ok: true });
  }

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
    // Se la richiesta era di un utente già registrato, il suo account diventa di tipo "locale".
    if (claim.user_id) {
      try { await gate.admin.from('profiles').update({ account_type: 'venue' }).eq('id', claim.user_id); } catch { /* noop */ }
    }
    // Email al referente: invito a creare/attivare l'account del locale.
    const email = claim.details?.email;
    if (email) {
      try {
        await sendVenueApprovalEmail(email, claim.venue_name, siteUrl(`/auth?next=${encodeURIComponent('/locale/' + claim.venue_key + '/gestione')}`));
      } catch (e) { console.warn('Email approvazione locale fallita:', e.message || e); }
    }
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
