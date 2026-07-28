// Sitemap generata da Next (App Router).
//
// Pagine statiche di sempre + i PERCORSI PUBBLICI, che sono l'unico contenuto che
// cresce da solo: ogni itinerario che un utente salva come pubblico diventa una pagina
// indicizzabile, senza che nessuno scriva nulla a mano. È il motore SEO dell'app.
//
// EGRESS: la lista dei percorsi arriva dal fetch in cache di lib/publicRoutes (1 ora),
// condiviso con le pagine /percorso — quindi la sitemap non aggiunge query proprie.
// Se Supabase non risponde, `getPublicRoutes` ritorna [] e la sitemap resta valida con
// le sole pagine statiche: meglio una sitemap ridotta che una rotta.
import { getPublicRoutes } from '@/lib/publicRoutes';
import { routeCities } from '@/lib/cityFromAddress';
import { routePublicPath } from '@/lib/slug';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app').replace(/\/+$/, '');

// Rigenerata al massimo una volta all'ora (allineata alla cache dei percorsi).
export const revalidate = 3600;

const STATIC_PAGES = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  // Landing SEO (bacaro tour / pub crawl) con versioni IT + EN e hreflang incrociato.
  { path: '/bacaro-tour', priority: 0.9, changeFrequency: 'monthly', languages: { 'it-IT': '/bacaro-tour', en: '/en/bacaro-tour' } },
  { path: '/pub-crawl', priority: 0.9, changeFrequency: 'monthly', languages: { 'it-IT': '/pub-crawl', en: '/en/pub-crawl' } },
  { path: '/en/bacaro-tour', priority: 0.8, changeFrequency: 'monthly', languages: { 'it-IT': '/bacaro-tour', en: '/en/bacaro-tour' } },
  { path: '/en/pub-crawl', priority: 0.8, changeFrequency: 'monthly', languages: { 'it-IT': '/pub-crawl', en: '/en/pub-crawl' } },
  { path: '/premium', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/business', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/install', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap() {
  const now = new Date();

  const staticEntries = STATIC_PAGES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    ...(r.languages
      ? {
          alternates: {
            languages: Object.fromEntries(
              Object.entries(r.languages).map(([lang, path]) => [lang, `${BASE}${path}`])
            ),
          },
        }
      : {}),
  }));

  // Un percorso senza tappe non è una pagina: niente contenuto da indicizzare.
  const publicRoutes = (await getPublicRoutes()).filter((r) => (r.waypoints || []).length >= 2);

  const routeEntries = publicRoutes.map((r) => ({
    url: `${BASE}${routePublicPath(r, routeCities(r))}`,
    lastModified: r.created_at ? new Date(r.created_at) : now,
    changeFrequency: 'weekly',
    // I giri che la gente fa davvero valgono più di quelli mai avviati.
    priority: (r.starts_count || 0) > 0 ? 0.8 : 0.6,
  }));

  return [...staticEntries, ...routeEntries];
}
