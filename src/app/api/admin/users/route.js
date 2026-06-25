import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/utils/supabase/admin';
import { r2DeletePrefix, isR2Configured } from '@/lib/r2';

// Account fondatore: NON può essere retrocesso o eliminato dal pannello (evita lock-out
// e cancellazioni accidentali del super-admin). Allineato a ADMIN_EMAILS in admin.js.
const PROTECTED_EMAILS = ['daddepesce@gmail.com'];

// Recupera email + ultimo accesso da auth.users (non sono sul profilo). Pagina finché serve.
async function fetchAuthIndex(admin) {
  const byId = {};
  let page = 1;
  const perPage = 1000;
  // Cap di sicurezza: 20 pagine = 20k utenti.
  for (let i = 0; i < 20; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    data.users.forEach((u) => {
      byId[u.id] = { email: u.email || null, last_sign_in_at: u.last_sign_in_at || null };
    });
    if (data.users.length < perPage) break;
    page += 1;
  }
  return byId;
}

// GET /api/admin/users — elenco utenti (con dati GDPR) + sessioni LIVE in corso. Solo admin.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [{ data: profiles }, { data: live }, authIndex] = await Promise.all([
    gate.admin.from('profiles')
      .select('id, username, display_name, created_at, is_premium, is_admin, consent_version, tos_accepted_at, sex, weight, marketing_consent, marketing_consent_at')
      .order('created_at', { ascending: false }),
    gate.admin.from('sessions')
      .select('id, user_id, title, location, total_units, drinks, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    fetchAuthIndex(gate.admin),
  ]);

  const nameById = {};
  (profiles || []).forEach((p) => { nameById[p.id] = p.display_name || p.username || 'Atleta'; });

  // Istante (ms) dell'ultimo drink registrato (added_times/added_at), fallback su created_at.
  const lastDrinkMs = (s) => {
    let last = new Date(s.created_at).getTime();
    (s.drinks || []).forEach((d) => {
      const times = Array.isArray(d.added_times) && d.added_times.length ? d.added_times : (d.added_at ? [d.added_at] : []);
      times.forEach((t) => { const ms = new Date(t).getTime(); if (Number.isFinite(ms) && ms > last) last = ms; });
    });
    return last;
  };

  const AUTOCLOSE_MS = 4 * 60 * 60 * 1000;
  const now = Date.now();
  const liveActive = (live || []).filter((s) => (now - lastDrinkMs(s)) < AUTOCLOSE_MS);

  const liveSessions = liveActive.map((s) => ({
    id: s.id,
    user: nameById[s.user_id] || 'Atleta',
    place: s.location?.name || 'Sessione libera',
    geo: !!(s.location && typeof s.location.lat === 'number' && s.location.lng != null && !s.location.freeform),
    units: parseFloat(s.total_units || 0),
    drinks: (s.drinks || []).reduce((a, d) => a + (d.qty || 0), 0),
    started: s.created_at,
  }));

  const users = (profiles || []).map((p) => {
    const auth = authIndex[p.id] || {};
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      email: auth.email,
      created_at: p.created_at,
      last_sign_in_at: auth.last_sign_in_at,
      premium: !!p.is_premium,
      admin: !!p.is_admin,
      consent: !!p.consent_version,
      consent_version: p.consent_version || null,
      tos_accepted_at: p.tos_accepted_at || null,
      // Consenso commerciale: true = sì, false = rifiutato, null = mai chiesto (legacy/Google)
      marketing: p.marketing_consent === true ? true : p.marketing_consent === false ? false : null,
      marketing_at: p.marketing_consent_at || null,
      profileDone: !!(p.sex || p.weight),
      protected: PROTECTED_EMAILS.includes((auth.email || '').toLowerCase()),
    };
  });

  const withConsent = users.filter((u) => u.consent).length;
  const marketingYes = users.filter((u) => u.marketing === true).length;

  return NextResponse.json({
    users,
    live: liveSessions,
    total: users.length,
    liveCount: liveSessions.length,
    me: gate.user.id,
    gdpr: { withConsent, withoutConsent: users.length - withConsent },
    marketing: { yes: marketingYes, no: users.length - marketingYes },
  });
}

// POST /api/admin/users — azioni amministrative su un singolo utente. Solo admin.
// Body: { action, userId, value? }
//  - set_admin   : promuove/retrocede ad amministratore
//  - set_premium : attiva/disattiva premium
//  - reset_password : invia all'utente l'email di reset password (flusso Supabase)
//  - export_user : esporta i dati dell'utente (GDPR art. 15/20) → JSON
//  - delete_user : cancella l'account (GDPR art. 17, diritto all'oblio) + media R2
export async function POST(req) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }); }
  const { action, userId, value } = body || {};
  if (!action || !userId) return NextResponse.json({ error: 'Parametri mancanti (action, userId)' }, { status: 400 });

  const admin = gate.admin;

  // Recupera l'utente target (profilo + email) per i controlli di sicurezza.
  const [{ data: target }, authRes] = await Promise.all([
    admin.from('profiles').select('id, username, display_name, is_admin, is_premium').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (!target) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  const targetEmail = (authRes?.data?.user?.email || '').toLowerCase();
  const isProtected = PROTECTED_EMAILS.includes(targetEmail);
  const isSelf = userId === gate.user.id;

  try {
    switch (action) {
      case 'set_admin': {
        const next = !!value;
        if (!next && isProtected) return NextResponse.json({ error: 'Non puoi retrocedere il fondatore.' }, { status: 403 });
        if (!next && isSelf) return NextResponse.json({ error: 'Non puoi rimuovere a te stesso i privilegi admin (evita il lock-out). Fallo fare a un altro admin.' }, { status: 403 });
        const { error } = await admin.from('profiles').update({ is_admin: next }).eq('id', userId);
        if (error) throw error;
        return NextResponse.json({ ok: true, message: next ? 'Utente promosso ad amministratore.' : 'Privilegi admin rimossi.' });
      }

      case 'set_premium': {
        const next = !!value;
        const { error } = await admin.from('profiles').update({ is_premium: next }).eq('id', userId);
        if (error) throw error;
        return NextResponse.json({ ok: true, message: next ? 'Premium attivato.' : 'Premium disattivato.' });
      }

      case 'reset_password': {
        if (!targetEmail) return NextResponse.json({ error: 'Utente senza email (login social?): impossibile inviare il reset.' }, { status: 400 });
        const origin = req.nextUrl.origin;
        const cookieStore = await cookies();
        const supa = createServerSupabase(cookieStore);
        const { error } = await supa.auth.resetPasswordForEmail(targetEmail, { redirectTo: `${origin}/auth/reset` });
        if (error) throw error;
        return NextResponse.json({ ok: true, message: `Email di reset inviata a ${targetEmail}.` });
      }

      case 'export_user': {
        const [{ data: profile }, { data: sessions }, { data: routes }] = await Promise.all([
          admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
          admin.from('sessions').select('*').eq('user_id', userId),
          admin.from('routes').select('*').eq('user_id', userId),
        ]);
        return NextResponse.json({
          ok: true,
          export: {
            generated_at: new Date().toISOString(),
            account: { id: userId, email: targetEmail || null },
            profile: profile || null,
            sessions: sessions || [],
            routes: routes || [],
          },
        });
      }

      case 'delete_user': {
        if (isProtected) return NextResponse.json({ error: 'Non puoi eliminare l\'account fondatore.' }, { status: 403 });
        if (isSelf) return NextResponse.json({ error: 'Non eliminare il tuo stesso account da qui: usa Impostazioni → Elimina account.' }, { status: 403 });
        if (isR2Configured) {
          try { await r2DeletePrefix(`media/${userId}/`); }
          catch (e) { console.error('Pulizia R2 fallita (admin delete):', e); }
        }
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return NextResponse.json({ ok: true, message: 'Account eliminato (diritto all\'oblio).' });
      }

      default:
        return NextResponse.json({ error: 'Azione sconosciuta' }, { status: 400 });
    }
  } catch (err) {
    console.error('Azione admin fallita:', action, err);
    return NextResponse.json({ error: err.message || 'Azione non riuscita' }, { status: 500 });
  }
}
