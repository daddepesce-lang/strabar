// Slug per gli URL pubblici e condivisibili.
//
// Perché uno slug e non solo l'id: un link che arriva su WhatsApp o nella SERP di Google
// deve DIRE cos'è. "/percorso/bacaro-tour-rialto-venezia-<uuid>" si clicca,
// "/percorso/<uuid>" no — e le parole nell'URL sono un segnale per la ricerca.
//
// L'id resta in coda (sorgente di verità): lo slug è puro decoro, quindi possiamo
// cambiare il nome di un percorso senza rompere i link già condivisi.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** "Bacaro Tour a Rialto!" → "bacaro-tour-a-rialto" (max ~60 caratteri, senza tagliare a metà parola). */
export function slugify(text, maxLen = 60) {
  const base = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // via gli accenti combinanti: à → a
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/**
 * Estrae l'id da un segmento di URL che può essere "<uuid>" oppure "<slug>-<uuid>".
 * Ritorna null se non c'è un uuid: così un URL manomesso finisce in 404, non in query strane.
 */
export function idFromSlug(segment) {
  const decoded = decodeURIComponent(String(segment || ''));
  const match = decoded.match(UUID_RE);
  return match ? match[0] : null;
}

/**
 * Path pubblico e canonico di un percorso: /percorso/<slug>-<uuid>.
 * Lo slug unisce nome del giro e prima città ("bacaro-tour-rialto-venezia").
 */
export function routePublicPath(route, cities = []) {
  if (!route?.id) return '/routes';
  const nameSlug = slugify(route.name);
  const citySlug = slugify(cities[0] || '');
  // Non ripetere la città se il nome già la contiene ("Tour dello Squero Dolo" + "Dolo"
  // darebbe ".../tour-dello-squero-dolo-dolo-<uuid>": sciatto in un URL condiviso).
  const slug = citySlug && !nameSlug.includes(citySlug) ? `${nameSlug}-${citySlug}` : nameSlug;
  return slug ? `/percorso/${slug}-${route.id}` : `/percorso/${route.id}`;
}
