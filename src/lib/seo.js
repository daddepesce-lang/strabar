// Costruttori di dati strutturati (JSON-LD) per le landing SEO.
// Un unico grafo @graph per pagina: Organization + WebPage + FAQPage.
// FAQPage abilita i rich result "domande frequenti" nella SERP di Google.
import { SITE_URL } from '@/lib/site';

export const organizationLd = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'Strabar',
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: 'App per creare, condividere e vivere bacaro tour e pub crawl: mappa i locali, pianifica le tappe e gareggia con gli amici.',
};

/**
 * Grafo JSON-LD completo per una landing.
 * @param {{ path:string, name:string, description:string, lang:string, faq?:Array<{q:string,a:string}> }} opts
 */
export function landingJsonLd({ path, name, description, lang, faq = [] }) {
  const url = `${SITE_URL}${path}`;
  const graph = [
    organizationLd,
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name,
      description,
      inLanguage: lang,
      isPartOf: { '@id': `${SITE_URL}/#organization` },
    },
  ];
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * Grafo JSON-LD di un PERCORSO pubblico (pagina /percorso/...).
 * Usa TouristTrip + itinerario di BarOrPub: è il vocabolario che Google associa agli
 * itinerari, quindi la pagina può comparire come "cosa fare a <città>" e non come
 * generico documento. Le tappe hanno nome, indirizzo e coordinate: dati veri, non fuffa.
 * @param {{ path:string, name:string, description:string, cities:string[], stops:Array<{name:string,address?:string,lat?:number,lng?:number}> }} opts
 */
export function routeJsonLd({ path, name, description, cities = [], stops = [] }) {
  const url = `${SITE_URL}${path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd,
      {
        '@type': 'TouristTrip',
        '@id': `${url}#trip`,
        url,
        name,
        description,
        touristType: ['Pub crawl', 'Bacaro tour'],
        ...(cities.length
          ? { location: cities.map((c) => ({ '@type': 'City', name: c })) }
          : {}),
        itinerary: {
          '@type': 'ItemList',
          numberOfItems: stops.length,
          itemListElement: stops.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'BarOrPub',
              name: s.name,
              ...(s.address ? { address: s.address } : {}),
              ...(typeof s.lat === 'number' && typeof s.lng === 'number'
                ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } }
                : {}),
            },
          })),
        },
        provider: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
}
