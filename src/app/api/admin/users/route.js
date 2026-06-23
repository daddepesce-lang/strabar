import { NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/supabase/admin';

// GET /api/admin/users — elenco utenti + sessioni LIVE in corso. Solo admin, service role.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [{ data: profiles }, { data: live }] = await Promise.all([
    gate.admin.from('profiles')
      .select('id, username, display_name, created_at, is_premium, is_admin, consent_version, sex, weight')
      .order('created_at', { ascending: false }),
    gate.admin.from('sessions')
      .select('id, user_id, title, location, total_units, drinks, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const nameById = {};
  (profiles || []).forEach((p) => { nameById[p.id] = p.display_name || p.username || 'Atleta'; });

  // Istante (ms) dell'ultimo drink registrato (added_times/added_at), fallback su created_at.
  // Stessa logica di db._lastDrinkTime: serve a NON mostrare come "live" sessioni stale.
  const lastDrinkMs = (s) => {
    let last = new Date(s.created_at).getTime();
    (s.drinks || []).forEach((d) => {
      const times = Array.isArray(d.added_times) && d.added_times.length ? d.added_times : (d.added_at ? [d.added_at] : []);
      times.forEach((t) => { const ms = new Date(t).getTime(); if (Number.isFinite(ms) && ms > last) last = ms; });
    });
    return last;
  };

  // Una sessione è davvero "live" solo se l'ultimo drink è entro la finestra di auto-chiusura
  // (4h). L'auto-chiusura vera gira lato client quando l'utente riapre l'app: se non riapre,
  // la riga resta is_active=true sul DB. Qui la filtriamo così l'admin non vede falsi "live".
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

  const users = (profiles || []).map((p) => ({
    id: p.id,
    username: p.username,
    display_name: p.display_name,
    created_at: p.created_at,
    premium: !!p.is_premium,
    admin: !!p.is_admin,
    consent: !!p.consent_version,
    profileDone: !!(p.sex || p.weight),
  }));

  return NextResponse.json({ users, live: liveSessions, total: users.length, liveCount: liveSessions.length });
}
