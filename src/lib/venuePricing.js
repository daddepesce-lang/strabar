// Motore prezzi dei servizi locali, CONDIVISO client (anteprima nel cruscotto) e server
// (prezzo autorevole nel checkout). Una sola fonte di verità → niente discrepanze.
//
// Ogni servizio ha una config `pricing` (jsonb in venue_service_types/overrides):
//  • flat:     { base_cents, spotlight_extra_cents? }
//  • per_day:  { per_day_cents, durations:[...], position:{feed,top}, discounts:[{minDays,pct}] }
//  • audience: { tiers:{venue,recent30,nearby,all}, nearby_km }

// Opzioni mostrate nel cruscotto, per codice servizio.
export const OPTION_SCHEMA = {
  sponsored_event: [
    { key: 'spotlight', type: 'bool', label: 'Spotlight+ (anche come card nel feed)', default: false },
  ],
  promo: [
    { key: 'days', type: 'select', label: 'Durata', default: 7,
      optionsFrom: 'durations', fallback: [3, 7, 14, 30], render: (d) => `${d} giorni` },
    { key: 'position', type: 'select', label: 'Posizione', default: 'feed',
      options: [{ v: 'feed', l: 'Nel feed' }, { v: 'top', l: 'In cima al feed (premium)' }] },
  ],
  notify: [
    { key: 'audience', type: 'select', label: 'A chi', default: 'venue',
      options: [
        { v: 'venue', l: 'Clienti del locale' },
        { v: 'recent30', l: 'Clienti ultimi 30 giorni' },
        { v: 'nearby', l: 'Utenti in zona' },
        { v: 'all', l: 'Tutti gli utenti' },
      ] },
  ],
};

export const AUDIENCE_LABEL = { venue: 'Clienti del locale', recent30: 'Ultimi 30 giorni', nearby: 'Utenti in zona', all: 'Tutti gli utenti' };

// Opzioni di default per un servizio (usate se il client non ne passa).
export function defaultOptions(code) {
  const out = {};
  (OPTION_SCHEMA[code] || []).forEach((o) => { out[o.key] = o.default; });
  return out;
}

// Prezzo in centesimi. `service` = { code, pricing, price_cents (fallback) }.
export function computePrice(service, options = {}) {
  const p = service?.pricing || {};
  const model = p.model || 'flat';
  const fallback = service?.price_cents || 0;

  if (model === 'per_day') {
    const perDay = p.per_day_cents || fallback;
    const days = Number(options.days) || (p.durations?.[1] ?? 7);
    const mult = (p.position && p.position[options.position]) || 1;
    let cents = perDay * days * mult;
    // sconto: la soglia più alta raggiunta
    let pct = 0;
    (p.discounts || []).forEach((d) => { if (days >= d.minDays && d.pct > pct) pct = d.pct; });
    cents = cents * (1 - pct / 100);
    return Math.round(cents);
  }

  if (model === 'audience') {
    const tiers = p.tiers || {};
    return Math.round(tiers[options.audience] ?? tiers.venue ?? fallback);
  }

  // flat
  let cents = p.base_cents ?? fallback;
  if (options.spotlight && p.spotlight_extra_cents) cents += p.spotlight_extra_cents;
  return Math.round(cents);
}

// Descrizione leggibile delle opzioni scelte (per riepiloghi/ordini).
export function describeOptions(code, options = {}) {
  if (code === 'promo') {
    const pos = options.position === 'top' ? 'in cima' : 'nel feed';
    return `${options.days || 7} giorni · ${pos}`;
  }
  if (code === 'notify') return AUDIENCE_LABEL[options.audience] || AUDIENCE_LABEL.venue;
  if (code === 'sponsored_event') return options.spotlight ? 'con Spotlight+' : 'standard';
  return '';
}

export const euro = (cents) => `€${((cents || 0) / 100).toFixed(2).replace('.', ',')}`;
