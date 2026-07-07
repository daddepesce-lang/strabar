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
  // Anche i profili degli ADMIN che hanno risolto i claim (per mostrare "chi ha approvato").
  const resolverIds = [...new Set((claims || []).map((c) => c.resolved_by).filter(Boolean))];
  const newResolverIds = resolverIds.filter((id) => !profMap[id]);
  if (newResolverIds.length) {
    const { data: rs } = await gate.admin.from('profiles').select('id, display_name, username').in('id', newResolverIds);
    (rs || []).forEach((p) => { profMap[p.id] = p; });
  }
  return NextResponse.json({ claims: (claims || []).map((c) => ({ ...c, requester: profMap[c.user_id] || null, resolver: c.resolved_by ? (profMap[c.resolved_by] || null) : null })) });
}

export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));

  // Collega manualmente un ACCOUNT (per email) a un locale: lo rende account_type='venue'
  // e crea/aggiorna un claim approvato. Usato quando il locale si è registrato dopo l'email.
  if (body.action === 'link_account') {
    const venueKey = (body.venue_key || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const venueName = body.venue_name || venueKey;
    if (!venueKey) return NextResponse.json({ error: 'venue_key obbligatorio' }, { status: 400 });
    // Account scelto: per user_id (dalla lista) o, in alternativa, per email.
    let uid = body.user_id || null;
    if (!uid) {
      const email = (body.email || '').trim();
      if (!email) return NextResponse.json({ error: 'Scegli un account (user_id) o un’email' }, { status: 400 });
      const { data: found, error: findErr } = await gate.admin.rpc('admin_find_user_id', { p_email: email });
      if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
      uid = found;
    }
    if (!uid) return NextResponse.json({ error: 'Nessun account Strabar con questa email. Chiedi al locale di registrarsi prima.' }, { status: 404 });
    await gate.admin.from('profiles').update({ account_type: 'venue' }).eq('id', uid);
    // collega: aggiorna un claim esistente (lead) o creane uno approvato
    const { data: existing } = await gate.admin.from('venue_claims').select('id').eq('venue_key', venueKey).or(`user_id.is.null,user_id.eq.${uid}`).limit(1);
    if (existing && existing.length) {
      await gate.admin.from('venue_claims').update({ user_id: uid, status: 'approved', venue_name: venueName, resolved_at: new Date().toISOString(), resolved_by: gate.user.id }).eq('id', existing[0].id);
    } else {
      await gate.admin.from('venue_claims').insert({ venue_key: venueKey, venue_name: venueName, user_id: uid, status: 'approved', resolved_at: new Date().toISOString(), resolved_by: gate.user.id });
    }
    const venueRow = { key: venueKey, name: venueName, verified: true, updated_at: new Date().toISOString() };
    if (Number.isFinite(body.lat) && Number.isFinite(body.lng)) { venueRow.lat = body.lat; venueRow.lng = body.lng; }
    await gate.admin.from('venues').upsert(venueRow, { onConflict: 'key' });
    try { await gate.admin.from('notifications').insert({ user_id: uid, type: 'venue_claim', message: `✅ Il tuo account è collegato a "${venueName}"`, link: `/locale/${encodeURIComponent(venueKey)}/gestione` }); } catch { /* noop */ }
    return NextResponse.json({ ok: true });
  }

  // Scollega: revoca la gestione di un locale (status → 'revoked'). Se quell'account non
  // gestisce più nessun locale, torna utente normale (account_type='user').
  if (body.action === 'unlink') {
    if (!body.id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
    const { data: c, error: e0 } = await gate.admin.from('venue_claims').select('*').eq('id', body.id).single();
    if (e0) return NextResponse.json({ error: e0.message }, { status: 500 });
    await gate.admin.from('venue_claims').update({ status: 'revoked', resolved_at: new Date().toISOString(), resolved_by: gate.user.id }).eq('id', c.id);
    if (c.user_id) {
      const { data: others } = await gate.admin.from('venue_claims').select('id').eq('user_id', c.user_id).eq('status', 'approved').limit(1);
      if (!others || others.length === 0) {
        try { await gate.admin.from('profiles').update({ account_type: 'user' }).eq('id', c.user_id); } catch { /* noop */ }
      }
      try { await gate.admin.from('notifications').insert({ user_id: c.user_id, type: 'venue_claim', message: `Il collegamento al locale "${c.venue_name}" è stato rimosso.`, link: '/' }); } catch { /* noop */ }
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.id || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 });
  }
  const status = body.action === 'approve' ? 'approved' : 'rejected';
  const { data: claim, error } = await gate.admin.from('venue_claims')
    .update({ status, admin_note: body.admin_note || null, resolved_at: new Date().toISOString(), resolved_by: gate.user.id })
    .eq('id', body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let linkedUid = null;
  let emailedTo = null;

  // Regola di collegamento all'APPROVAZIONE (deterministica):
  //  A) richiesta fatta da un account loggato → collega QUEL account (l'email-contatto
  //     nel form è solo un recapito, non conta per l'accesso).
  //  B) lead senza account → prova a matchare l'email-contatto:
  //       • esiste già un account con quell'email → collega quello;
  //       • non esiste → email d'invito a registrarsi CON QUELL'EMAIL (il trigger collega
  //         in automatico alla registrazione). Se userà un'email diversa → colleghi a mano.
  if (status === 'approved') {
    try {
      await gate.admin.from('venues').upsert(
        { key: claim.venue_key, name: claim.venue_name, verified: true, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    } catch { /* noop */ }

    // Collegamento:
    //  A) richiesta fatta da loggato → quell'account (il form ha l'email bloccata sull'account).
    //  B) lead da non loggato → l'email della richiesta (match o invito a registrarsi).
    const email = claim.details?.email;
    linkedUid = claim.user_id || null;
    if (!linkedUid && email) {
      try {
        const { data: uid } = await gate.admin.rpc('admin_find_user_id', { p_email: email });
        if (uid) {
          linkedUid = uid;
          await gate.admin.from('venue_claims').update({ user_id: uid }).eq('id', claim.id);
        }
      } catch { /* noop */ }
    }

    if (linkedUid) {
      try { await gate.admin.from('profiles').update({ account_type: 'venue' }).eq('id', linkedUid); } catch { /* noop */ }
    } else if (email) {
      // L'email non ha ancora un account: invito a registrarsi con QUELL'email
      // (alla registrazione il trigger collega in automatico).
      try {
        await sendVenueApprovalEmail(email, claim.venue_name, siteUrl(`/auth?next=${encodeURIComponent('/locale/' + claim.venue_key + '/gestione')}`));
        emailedTo = email;
      } catch (e) { console.warn('Email approvazione locale fallita:', e.message || e); }
    }
  }

  // Notifica in-app all'account collegato (se c'è).
  const notifyUid = linkedUid || claim.user_id;
  if (notifyUid) {
    try {
      await gate.admin.from('notifications').insert({
        user_id: notifyUid,
        type: 'venue_claim',
        message: status === 'approved'
          ? `✅ Sei ora gestore di "${claim.venue_name}" su Strabar!`
          : `La richiesta di gestione per "${claim.venue_name}" non è stata approvata.`,
        link: `/locale/${encodeURIComponent(claim.venue_key)}/gestione`,
      });
    } catch { /* notifica best-effort */ }
  }

  return NextResponse.json({ ok: true, claim, linked: !!linkedUid, emailedTo });
}
