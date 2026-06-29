// Badge / achievement: definizione condivisa tra Profilo (vetrina) e Home (rilevamento
// in tempo reale durante la sessione). La logica delle soglie sta QUI, una sola fonte di
// verità. I testi (titolo/descrizione/soglia) sono tradotti via i18n: profile.bdg.<id>.{t,d,th}

// Ordine canonico + emoji. Le soglie sono calcolate da computeBadgeStats().
export const BADGE_LIST = [
  { id: 'first_sip', icon: '🍺' },
  { id: 'habitue', icon: '🥂' },
  { id: 'veteran', icon: '🏅' },
  { id: 'champion', icon: '🏆' },
  { id: 'ua_10', icon: '💪' },
  { id: 'ua_50', icon: '🔥' },
  { id: 'ua_100', icon: '💥' },
  { id: 'bar_3', icon: '📍' },
  { id: 'bar_10', icon: '🗺️' },
  { id: 'barhop_1', icon: '🔄' },
  { id: 'barhop_3', icon: '🎯' },
  { id: 'heavy_session', icon: '⚡' },
  { id: 'active_7', icon: '📅' },
  { id: 'active_30', icon: '📊' },
];

export const BADGE_ICON = Object.fromEntries(BADGE_LIST.map((b) => [b.id, b.icon]));

// Statistiche aggregate dalle sessioni dell'utente.
export function computeBadgeStats(activities = []) {
  const sessionsCount = activities.length;
  const totalU = activities.reduce((a, x) => a + parseFloat(x.total_units || 0), 0);
  const uniqueBars = new Set(activities.map((a) => a.location?.name).filter(Boolean)).size;
  const barHopSessions = activities.filter(
    (a) => a.location?.sequence && Array.isArray(a.location.sequence) && a.location.sequence.length > 1
  ).length;
  const maxSingleUnits = activities.reduce((m, a) => Math.max(m, parseFloat(a.total_units || 0)), 0);
  const daysWithSession = new Set(activities.map((a) => new Date(a.created_at).toDateString())).size;
  return { sessionsCount, totalU, uniqueBars, barHopSessions, maxSingleUnits, daysWithSession };
}

// Mappa id → condizione "ottenuto" date le statistiche.
export function badgeChecks(s) {
  return {
    first_sip: s.sessionsCount >= 1,
    habitue: s.sessionsCount >= 5,
    veteran: s.sessionsCount >= 10,
    champion: s.sessionsCount >= 20,
    ua_10: s.totalU >= 10,
    ua_50: s.totalU >= 50,
    ua_100: s.totalU >= 100,
    bar_3: s.uniqueBars >= 3,
    bar_10: s.uniqueBars >= 10,
    barhop_1: s.barHopSessions >= 1,
    barhop_3: s.barHopSessions >= 3,
    heavy_session: s.maxSingleUnits >= 5,
    active_7: s.daysWithSession >= 7,
    active_30: s.daysWithSession >= 30,
  };
}

// Lista degli id badge OTTENUTI, nell'ordine canonico.
export function earnedBadgeIds(activities = []) {
  const checks = badgeChecks(computeBadgeStats(activities));
  return BADGE_LIST.map((b) => b.id).filter((id) => checks[id]);
}
