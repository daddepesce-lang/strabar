// robots.txt generato da Next (App Router).
// Blocca dal crawl le pagine SENZA valore SEO: sezioni app riservate agli utenti
// (mostrano tutte la stessa schermata "registrati" → contenuto duplicato per Google)
// e pagine personali/di servizio. Così spariscono i "duplicati senza canonical" e i
// tentativi di indicizzare pagine che rimandano al login.
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app').replace(/\/+$/, '');

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/profile',
          '/notifications',
          '/settings',
          '/log',
          '/search',
          '/auth',
          // Sezioni app: agli anonimi mostrano solo il muro "registrati" (stesso contenuto).
          '/places',
          '/events',
          '/routes',
          '/groups',
          '/live',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
