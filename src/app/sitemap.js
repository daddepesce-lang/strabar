// Sitemap generata da Next (App Router).
// SOLO pagine pubbliche con contenuto reale e indicizzabile. È STATICA di proposito:
// niente query a Supabase (nessun egress aggiunto) — le pagine dinamiche (sessioni
// condivise, profili, locali) restano raggiungibili dai link ma fuori dalla sitemap.
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app').replace(/\/+$/, '');

export default function sitemap() {
  const now = new Date();
  const routes = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
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
  }));
}
