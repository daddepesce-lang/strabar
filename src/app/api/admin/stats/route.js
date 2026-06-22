import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

// GET /api/admin/stats — metriche aggregate per la dashboard amministratore.
// Sicurezza: 1) identifica l'utente dai cookie di sessione; 2) verifica che sia admin
// (flag profiles.is_admin OPPURE email in allowlist); 3) legge i dati con la SERVICE ROLE
// (bypassa la RLS) ma restituisce SOLO aggregati e una lista utenti minimale.
// Richiede SUPABASE_SERVICE_ROLE_KEY (segreta, solo lato server).

const ADMIN_EMAILS = ['daddepesce@gmail.com'];

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabase(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !url) {
      return NextResponse.json({ error: 'Admin non configurato sul server (manca SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 });
    }
    const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Verifica ruolo admin: flag sul profilo o email in allowlist.
    const { data: me } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    const isAdmin = (me && me.is_admin) || ADMIN_EMAILS.includes((user.email || '').toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accesso riservato agli amministratori' }, { status: 403 });
    }

    // --- Dati grezzi (service role) ---
    const [{ data: profiles }, { data: sessions }] = await Promise.all([
      admin.from('profiles').select('id, username, display_name, created_at, consent_version, sex, weight, is_premium, is_admin'),
      admin.from('sessions').select('id, user_id, total_units, drinks, created_at, location, is_active'),
    ]);

    const users = profiles || [];
    const sess = sessions || [];
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const since = (d) => now - d * DAY;

    // Utenti
    const totalUsers = users.length;
    const newUsers7d = users.filter((u) => new Date(u.created_at).getTime() >= since(7)).length;
    const newUsers30d = users.filter((u) => new Date(u.created_at).getTime() >= since(30)).length;
    const withConsent = users.filter((u) => !!u.consent_version).length;
    const withProfile = users.filter((u) => u.sex || u.weight).length;
    const nameById = {};
    users.forEach((u) => { nameById[u.id] = u.display_name || u.username || 'Atleta'; });

    // Sessioni
    const totalSessions = sess.length;
    const activeSessions = sess.filter((s) => s.is_active).length;
    const sessions7d = sess.filter((s) => new Date(s.created_at).getTime() >= since(7)).length;
    const totalUnits = sess.reduce((acc, s) => acc + parseFloat(s.total_units || 0), 0);
    const totalDrinks = sess.reduce((acc, s) => acc + (s.drinks || []).reduce((a, d) => a + (d.qty || 0), 0), 0);

    // Check-in geolocalizzati validi (stessa regola delle classifiche)
    const geo = sess.filter((s) => {
      const loc = s.location;
      return loc && loc.name && !loc.freeform && !loc.unverified &&
        typeof loc.lat === 'number' && typeof loc.lng === 'number' && loc.share !== 'private';
    });

    // Top locali
    const venueAgg = {};
    geo.forEach((s) => {
      const key = norm(s.location.name);
      if (!venueAgg[key]) venueAgg[key] = { name: s.location.name, sessions: 0, units: 0 };
      venueAgg[key].sessions += 1;
      venueAgg[key].units += parseFloat(s.total_units || 0);
    });
    const topVenues = Object.values(venueAgg)
      .map((v) => ({ ...v, units: parseFloat(v.units.toFixed(1)) }))
      .sort((a, b) => b.sessions - a.sessions || b.units - a.units)
      .slice(0, 10);

    // Top atleti (per U.A. sui check-in geolocalizzati)
    const userAgg = {};
    geo.forEach((s) => {
      if (!userAgg[s.user_id]) userAgg[s.user_id] = { user_id: s.user_id, name: nameById[s.user_id] || 'Atleta', units: 0, sessions: 0 };
      userAgg[s.user_id].units += parseFloat(s.total_units || 0);
      userAgg[s.user_id].sessions += 1;
    });
    const topUsers = Object.values(userAgg)
      .map((u) => ({ ...u, units: parseFloat(u.units.toFixed(1)) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 10);

    // Iscrizioni ultimi 14 giorni
    const signups = Array.from({ length: 14 }, (_, i) => {
      const dayStart = now - (13 - i) * DAY;
      const d = new Date(dayStart);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      const count = users.filter((u) => {
        const t = new Date(u.created_at).getTime();
        return t >= dayStart - (dayStart % DAY) && t < dayStart - (dayStart % DAY) + DAY;
      }).length;
      return { label, count };
    });

    // Ultimi iscritti (minimale)
    const recentUsers = [...users]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map((u) => ({
        username: u.username,
        display_name: u.display_name,
        created_at: u.created_at,
        consent: !!u.consent_version,
        premium: !!u.is_premium,
        admin: !!u.is_admin,
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      users: { total: totalUsers, new7d: newUsers7d, new30d: newUsers30d, withConsent, withProfile },
      sessions: {
        total: totalSessions,
        active: activeSessions,
        last7d: sessions7d,
        totalUnits: parseFloat(totalUnits.toFixed(1)),
        totalDrinks,
        geoCheckins: geo.length,
        avgUnitsPerUser: totalUsers ? parseFloat((totalUnits / totalUsers).toFixed(1)) : 0,
      },
      topVenues,
      topUsers,
      signups,
      recentUsers,
    });
  } catch (err) {
    console.error('Errore /api/admin/stats:', err);
    return NextResponse.json({ error: err.message || 'Errore' }, { status: 500 });
  }
}
