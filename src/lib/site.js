// URL CANONICO dell'app, usato per i link CONDIVISI (install, card social, link sessione).
// Così tutto ciò che viene condiviso punta a strabar.app — il dominio ufficiale — anche se
// l'app è aperta da un altro dominio (es. strabar-delta.vercel.app resta comunque valido).
// Override possibile con NEXT_PUBLIC_SITE_URL.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app').replace(/\/+$/, '');

// Costruisce un URL assoluto canonico per un path (es. siteUrl('/install')).
export const siteUrl = (path = '') => SITE_URL + (path.startsWith('/') ? path : `/${path}`);

// Solo l'host canonico (es. "strabar.app") — utile dove serve il testo del dominio.
export const SITE_HOST = (() => {
  try { return new URL(SITE_URL).host; } catch { return 'strabar.app'; }
})();
