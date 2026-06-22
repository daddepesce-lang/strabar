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

  const liveSessions = (live || []).map((s) => ({
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
