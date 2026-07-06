// Badge / achievement: FONTE DI VERITÀ UNICA condivisa tra Profilo (vetrina + progresso),
// Home (rilevamento in tempo reale durante la sessione) e componente di sblocco.
// Ogni badge è { id, icon, stat, target }: "ottenuto" quando la statistica >= soglia.
// I testi (titolo/descrizione/soglia) sono tradotti via i18n: profile.bdg.<id>.{t,d,th}

// Ordine canonico. `stat` = chiave in computeBadgeStats(); `target` = soglia.
export const BADGE_DEFS = [
  // Sessioni
  { id: 'first_sip', icon: '🍺', stat: 'sessionsCount', target: 1 },
  { id: 'habitue', icon: '🥂', stat: 'sessionsCount', target: 5 },
  { id: 'veteran', icon: '🏅', stat: 'sessionsCount', target: 10 },
  { id: 'champion', icon: '🏆', stat: 'sessionsCount', target: 20 },
  { id: 'legend_50', icon: '👑', stat: 'sessionsCount', target: 50 },
  // Unità alcoliche totali
  { id: 'ua_10', icon: '💪', stat: 'totalU', target: 10 },
  { id: 'ua_50', icon: '🔥', stat: 'totalU', target: 50 },
  { id: 'ua_100', icon: '💥', stat: 'totalU', target: 100 },
  { id: 'ua_200', icon: '☄️', stat: 'totalU', target: 200 },
  { id: 'ua_500', icon: '🌋', stat: 'totalU', target: 500 },
  // Locali diversi
  { id: 'bar_3', icon: '📍', stat: 'uniqueBars', target: 3 },
  { id: 'bar_10', icon: '🗺️', stat: 'uniqueBars', target: 10 },
  { id: 'bar_25', icon: '🌍', stat: 'uniqueBars', target: 25 },
  { id: 'bar_50', icon: '🧭', stat: 'uniqueBars', target: 50 },
  // Giro dei bar / percorsi
  { id: 'barhop_1', icon: '🔄', stat: 'barHopSessions', target: 1 },
  { id: 'barhop_3', icon: '🎯', stat: 'barHopSessions', target: 3 },
  { id: 'tours_1', icon: '🚩', stat: 'toursCompleted', target: 1 },
  { id: 'tours_5', icon: '🏁', stat: 'toursCompleted', target: 5 },
  // Intensità e costanza
  { id: 'heavy_session', icon: '⚡', stat: 'maxSingleUnits', target: 5 },
  { id: 'active_7', icon: '📅', stat: 'daysWithSession', target: 7 },
  { id: 'active_30', icon: '📊', stat: 'daysWithSession', target: 30 },
  { id: 'active_100', icon: '📆', stat: 'daysWithSession', target: 100 },
  { id: 'streak_7', icon: '🌟', stat: 'streakDays', target: 7 },
];

// Retro-compatibilità: alcune parti importano ancora BADGE_LIST.
export const BADGE_LIST = BADGE_DEFS;
export const BADGE_ICON = Object.fromEntries(BADGE_DEFS.map((b) => [b.id, b.icon]));

// Badge STAGIONALI / a tempo: attivi solo in una finestra di date; si ottengono con una
// sessione dentro la finestra. Se ne aggiungono/attivano a mano qui, quando serve.
// `from`/`to` in ISO. Testi come gli altri badge (profile.bdg.<id>).
export const SEASONAL_DEFS = [
  { id: 'summer_2026', icon: '☀️', from: '2026-06-21', to: '2026-09-23' },
];

// Statistiche aggregate dalle sessioni dell'utente (una sola passata).
export function computeBadgeStats(activities = []) {
  const sessionsCount = activities.length;
  const totalU = activities.reduce((a, x) => a + parseFloat(x.total_units || 0), 0);
  const uniqueBars = new Set(activities.map((a) => a.location?.name).filter(Boolean)).size;
  const barHopSessions = activities.filter(
    (a) => a.location?.sequence && Array.isArray(a.location.sequence) && a.location.sequence.length > 1
  ).length;
  // Percorsi/tour: sessioni avviate come tour guidato (location.tour presente).
  const toursCompleted = activities.filter((a) => a.location?.tour).length;
  const maxSingleUnits = activities.reduce((m, a) => Math.max(m, parseFloat(a.total_units || 0)), 0);
  const daysWithSession = new Set(activities.map((a) => new Date(a.created_at).toDateString())).size;
  const streakDays = longestDayStreak(activities);
  return { sessionsCount, totalU, uniqueBars, barHopSessions, toursCompleted, maxSingleUnits, daysWithSession, streakDays };
}

// Serie più lunga di GIORNI DI CALENDARIO consecutivi con almeno una sessione.
function longestDayStreak(activities = []) {
  const days = [...new Set(activities.map((a) => {
    const d = new Date(a.created_at); d.setHours(0, 0, 0, 0); return d.getTime();
  }))].sort((a, b) => a - b);
  if (!days.length) return 0;
  const DAY = 86400000;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = (days[i] - days[i - 1] === DAY) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// Mappa id → condizione "ottenuto" date le statistiche (derivata da BADGE_DEFS).
export function badgeChecks(s) {
  return Object.fromEntries(BADGE_DEFS.map((d) => [d.id, (s[d.stat] || 0) >= d.target]));
}

// Lista degli id badge OTTENUTI, nell'ordine canonico (usata dalla Home per gli sblocchi).
export function earnedBadgeIds(activities = []) {
  const checks = badgeChecks(computeBadgeStats(activities));
  return BADGE_DEFS.map((b) => b.id).filter((id) => checks[id]);
}

// Progresso per OGNI badge: { id, icon, cur, target, earned, pct }. Usata dal Profilo per
// la griglia con barra di avanzamento e la card di dettaglio (quanto manca allo sblocco).
export function badgeProgress(activities = []) {
  const s = computeBadgeStats(activities);
  return BADGE_DEFS.map((d) => {
    const cur = Math.round((s[d.stat] || 0) * 10) / 10;
    return { id: d.id, icon: d.icon, cur, target: d.target, earned: cur >= d.target, pct: Math.max(0, Math.min(100, Math.round((cur / d.target) * 100))) };
  });
}

// Badge stagionali con stato, per una certa data "nowMs". Ritorna solo quelli ATTIVI ora
// o già ottenuti: { id, icon, earned, active, from, to }.
export function seasonalBadges(activities = [], nowMs) {
  return SEASONAL_DEFS.map((d) => {
    const fromMs = new Date(d.from).getTime();
    const toMs = new Date(d.to).getTime();
    const active = nowMs >= fromMs && nowMs <= toMs;
    const earned = activities.some((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= fromMs && t <= toMs;
    });
    return { id: d.id, icon: d.icon, earned, active, from: d.from, to: d.to };
  }).filter((b) => b.active || b.earned);
}
