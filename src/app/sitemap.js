// Sitemap generata da Next (App Router).
// SOLO pagine pubbliche con contenuto reale e indicizzabile. È STATICA di proposito:
// niente query a Supabase (nessun egress aggiunto) — le pagine dinamiche (sessioni
// condivise, profili, locali) restano raggiungibili dai link ma fuori dalla sitemap.
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app').replace(/\/+$/, '');

export default function sitemap() {
  const now = new Date();
  const routes = [
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
  return routes.map((r) => ({
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
}
