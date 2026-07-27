import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

const FAQ = [
  { q: 'Cos’è un pub crawl?', a: 'Un pub crawl (o bar crawl) è un giro organizzato di più bar o pub in una serata: ci si sposta di locale in locale bevendo una consumazione a tappa. È un modo divertente di esplorare la vita notturna di una città in gruppo.' },
  { q: 'Come si organizza un pub crawl?', a: 'Scegli una zona con tanti locali vicini, seleziona 4-6 bar, mettili in ordine per ridurre gli spostamenti e stabilisci quante consumazioni fare a tappa. Con Strabar cerchi i pub sulla mappa, li aggiungi come tappe e l’app calcola percorso, distanza e tempo.' },
  { q: 'Quanti bar si visitano in un pub crawl?', a: 'Di solito da 4 a 7 locali. Su Strabar imposti un target di drink per tappa così il gruppo resta insieme e il giro non degenera.' },
  { q: 'Serve un’app per il pub crawl?', a: 'Non è obbligatoria, ma aiuta parecchio: con Strabar pianifichi il percorso, lo condividi con un link, lo avvii in modalità guidata e tieni il conteggio delle consumazioni. Niente più organizzazione via chat.' },
  { q: 'Strabar è gratis?', a: 'Sì: seguire, condividere e vivere i pub crawl è gratuito. Il pianificatore avanzato con ricerca dei locali sulla mappa è incluso in Strabar Premium.' },
];

export const metadata = {
  title: 'Pub Crawl: come organizzare un giro di bar | Strabar',
  description: 'Pub crawl e bar crawl: cos’è, come organizzare il giro dei pub tappa per tappa e come crearlo, condividerlo e viverlo con l’app Strabar.',
  keywords: 'pub crawl, bar crawl, giro dei pub, organizzare pub crawl, app pub crawl, giro dei bar, crawl bar',
  alternates: {
    canonical: '/pub-crawl',
    languages: { 'it-IT': '/pub-crawl', en: '/en/pub-crawl', 'x-default': '/pub-crawl' },
  },
  openGraph: {
    title: 'Pub Crawl: come organizzare un giro di bar | Strabar',
    description: 'Pianifica, condividi e vivi il tuo pub crawl con Strabar.',
    url: '/pub-crawl',
    type: 'article',
    locale: 'it_IT',
  },
};

export default function PubCrawlPage() {
  return (
    <SeoLanding
      eyebrow="Pub Crawl"
      h1="Pub Crawl: organizza il tuo giro di bar, tappa per tappa"
      lead="Un bar dopo l’altro, con gli amici e senza pensieri. Strabar è l’app per pianificare il pub crawl perfetto: cerca i locali sulla mappa, costruisci il percorso e vivilo in modalità guidata."
      ctas={[
        { label: '🗺️ Crea il tuo pub crawl', href: '/routes', primary: true },
        { label: 'Scarica l’app', href: '/install' },
      ]}
      sections={[
        {
          id: 'cos-e',
          h2: 'Cos’è un pub crawl',
          paragraphs: [
            'Un pub crawl — chiamato anche bar crawl o “giro dei pub” — è un percorso tra più bar o pub in una stessa serata: si beve una consumazione per locale e ci si sposta a piedi verso la tappa successiva. Nato nei paesi anglosassoni, è oggi un classico della vita notturna in tutto il mondo.',
            'L’idea è esplorare tanti locali diversi invece di passare la serata in uno solo: ogni tappa ha la sua atmosfera, la sua specialità, la sua gente.',
          ],
        },
        {
          id: 'buon-crawl',
          h2: 'Cosa rende un buon pub crawl',
          list: [
            { t: 'Locali vicini', d: 'scegli una zona ricca di bar per camminare poco tra una tappa e l’altra.' },
            { t: 'Ordine giusto', d: 'metti le tappe in sequenza logica per non tornare sui tuoi passi.' },
            { t: 'Ritmo sostenibile', d: 'una consumazione a tappa, così il gruppo resta insieme fino alla fine.' },
            { t: 'Un piano condiviso', d: 'tutti sanno dove si va: niente attese e messaggi persi nella chat.' },
          ],
        },
        {
          id: 'con-strabar',
          h2: 'Come organizzare un pub crawl con Strabar',
          paragraphs: [
            'Strabar trasforma l’idea “stasera giro di bar” in un itinerario pronto. Cerchi i pub sulla mappa, li aggiungi come tappe e vedi subito distanza a piedi, tempo stimato e ordine ottimale del percorso.',
            'Salvi il pub crawl, lo condividi con un link e lo avvii in modalità “tour guidato”: l’app accompagna il gruppo tappa per tappa e tiene il conto delle consumazioni, con classifiche e sfide tra amici.',
          ],
        },
      ]}
      stepsTitle="Come funziona, in 4 passi"
      steps={[
        { title: 'Cerca i pub', desc: 'Trova bar e pub sulla mappa per nome o per zona della città.' },
        { title: 'Componi le tappe', desc: 'Aggiungi i locali e ordinali: Strabar calcola distanza e tempo a piedi.' },
        { title: 'Imposta il ritmo', desc: 'Decidi quante consumazioni fare a tappa e tieni insieme il gruppo.' },
        { title: 'Vivi e condividi', desc: 'Avvia il tour guidato, invita gli amici e condividi il percorso con un link.' },
      ]}
      faq={FAQ}
      faqTitle="Domande frequenti sul pub crawl"
      finalCta={{
        title: 'Organizza il pub crawl perfetto',
        sub: 'Crea il tuo giro di bar, salvalo e condividilo con il gruppo. Gratis da seguire, semplice da creare.',
        button: { label: '🗺️ Inizia ora su Strabar', href: '/routes' },
      }}
      relatedTitle="Continua a esplorare"
      related={[
        { label: 'Fai un bacaro tour a Venezia', href: '/bacaro-tour' },
        { label: 'Pub crawl (English)', href: '/en/pub-crawl' },
        { label: 'Strabar Premium', href: '/premium' },
      ]}
      jsonLd={landingJsonLd({
        path: '/pub-crawl',
        name: 'Pub Crawl: come organizzare un giro di bar',
        description: 'Guida al pub crawl: cos’è, come organizzare il giro dei pub tappa per tappa e come crearlo con Strabar.',
        lang: 'it-IT',
        faq: FAQ,
      })}
    />
  );
}
