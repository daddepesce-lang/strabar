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
