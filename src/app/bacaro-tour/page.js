import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

const FAQ = [
  { q: 'Cos’è un bacaro tour?', a: 'Un bacaro tour è un giro tra i bacari — le tipiche osterie veneziane — dove ci si ferma di tappa in tappa per un’ombra de vin (un bicchiere di vino) e qualche cicchetto. È la versione veneziana del pub crawl: si cammina poco, si assaggia molto e si beve con calma passando da un locale all’altro.' },
  { q: 'Come organizzo un bacaro tour a Venezia?', a: 'Scegli una zona (Rialto, Cannaregio, San Polo), individua 4-6 bacari vicini tra loro, mettili in ordine per ridurre gli spostamenti a piedi e fissa quante ombre/cicchetti fare a tappa. Con Strabar cerchi i locali sulla mappa, li aggiungi come tappe e l’app calcola distanza a piedi e ordine ottimale.' },
  { q: 'Quanti bacari si visitano in un giro?', a: 'In genere da 4 a 7 tappe: abbastanza per assaggiare specialità diverse senza esagerare. Su Strabar imposti un target di drink per tappa così tieni il ritmo sotto controllo.' },
  { q: 'Qual è la differenza tra bacaro tour e pub crawl?', a: 'Il concetto è lo stesso — un giro di locali — ma il bacaro tour è la tradizione veneziana fatta di vino, cicchetti e osterie storiche, mentre il pub crawl è più internazionale e legato a birra e pub. Su Strabar puoi creare entrambi.' },
  { q: 'Strabar è gratis?', a: 'Sì: seguire, condividere e vivere i tour è gratuito. Il pianificatore avanzato per creare percorsi personalizzati con ricerca dei locali sulla mappa è incluso in Strabar Premium.' },
];

export const metadata = {
  title: 'Bacaro Tour a Venezia: cos’è e come organizzarlo | Strabar',
  description: 'Bacaro tour: il giro dei bacari di Venezia tra ombre e cicchetti. Scopri cos’è, come organizzarlo tappa per tappa e crea il tuo itinerario con Strabar.',
  keywords: 'bacaro tour, bacaro tour venezia, giro dei bacari, bacari venezia, cicchetti venezia, ombra de vin, osterie venezia, pub crawl venezia',
  alternates: {
    canonical: '/bacaro-tour',
    languages: { 'it-IT': '/bacaro-tour', en: '/en/bacaro-tour', 'x-default': '/bacaro-tour' },
  },
  openGraph: {
    title: 'Bacaro Tour a Venezia: cos’è e come organizzarlo | Strabar',
    description: 'Il giro dei bacari di Venezia tra ombre e cicchetti. Crea il tuo itinerario con Strabar.',
    url: '/bacaro-tour',
    type: 'article',
    locale: 'it_IT',
  },
};

export default function BacaroTourPage() {
  return (
    <SeoLanding
      eyebrow="Bacaro Tour"
      h1="Bacaro Tour a Venezia: il giro dei bacari, spiegato e organizzato"
      lead="Ombra dopo ombra, cicchetto dopo cicchetto: il bacaro tour è il modo più autentico di vivere Venezia. Strabar ti aiuta a scoprire i bacari, costruire l’itinerario perfetto e condividerlo con gli amici."
      ctas={[
        { label: '🗺️ Crea il tuo bacaro tour', href: '/routes', primary: true },
        { label: 'Scarica l’app', href: '/install' },
      ]}
      sections={[
        {
          id: 'cos-e',
          h2: 'Cos’è un bacaro tour',
          paragraphs: [
            'Un bacaro tour è un giro tra i bacari veneziani — le osterie tradizionali dove si beve un’“ombra” (un bicchiere di vino) accompagnata dai cicchetti, gli stuzzichini tipici della laguna. Ci si sposta a piedi da un locale all’altro, fermandosi giusto il tempo di un assaggio, per poi proseguire verso la tappa successiva.',
            'È la versione veneziana del pub crawl: meno birra e più vino, meno corsa e più convivialità. L’obiettivo non è bere tanto, ma assaggiare tante specialità diverse in locali storici, spesso nascosti tra le calli.',
          ],
        },
        {
          id: 'tappe',
          h2: 'Cosa non può mancare in un giro dei bacari',
          list: [
            { t: 'Ombra de vin', d: 'un piccolo bicchiere di vino locale, il cuore di ogni tappa.' },
            { t: 'Cicchetti', d: 'baccalà mantecato, sarde in saor, polpette, crostini: si ordinano al banco.' },
            { t: 'Zone giuste', d: 'il mercato di Rialto, Cannaregio e San Polo concentrano i bacari storici.' },
            { t: 'Passo lento', d: '4-6 tappe vicine tra loro, ordinate per camminare il meno possibile.' },
          ],
        },
        {
          id: 'con-strabar',
          h2: 'Come creare un bacaro tour con Strabar',
          paragraphs: [
            'Strabar è l’app che trasforma un giro dei bacari improvvisato in un itinerario vero. Cerchi i locali sulla mappa, li aggiungi come tappe e vedi subito distanza a piedi, tempo stimato e ordine ottimale del percorso.',
            'Puoi salvare il tuo bacaro tour, condividerlo con un link e persino avviarlo in modalità “tour guidato”: l’app ti accompagna tappa per tappa e tiene il conto delle ombre.',
          ],
        },
      ]}
      stepsTitle="Come funziona, in 4 passi"
      steps={[
        { title: 'Cerca i bacari', desc: 'Trova osterie e bacari sulla mappa per nome o per zona (Rialto, Cannaregio…).' },
        { title: 'Componi le tappe', desc: 'Aggiungi i locali all’itinerario e ordinali: Strabar calcola distanza e tempo a piedi.' },
        { title: 'Imposta il ritmo', desc: 'Decidi quante ombre/cicchetti fare a tappa e mantieni il giro sotto controllo.' },
        { title: 'Vivi e condividi', desc: 'Avvia il tour guidato, invita gli amici e condividi il percorso con un link.' },
      ]}
      faq={FAQ}
      faqTitle="Domande frequenti sul bacaro tour"
      finalCta={{
        title: 'Pronto per il tuo giro dei bacari?',
        sub: 'Crea il tuo bacaro tour di Venezia, salvalo e condividilo con chi vuoi. Gratis da seguire, semplice da creare.',
        button: { label: '🗺️ Inizia ora su Strabar', href: '/routes' },
      }}
      relatedTitle="Continua a esplorare"
      related={[
        { label: 'Organizza un pub crawl', href: '/pub-crawl' },
        { label: 'Bacaro tour (English)', href: '/en/bacaro-tour' },
        { label: 'Strabar Premium', href: '/premium' },
      ]}
      jsonLd={landingJsonLd({
        path: '/bacaro-tour',
        name: 'Bacaro Tour a Venezia: cos’è e come organizzarlo',
        description: 'Guida al bacaro tour di Venezia: cos’è, come organizzare il giro dei bacari tra ombre e cicchetti e come crearlo con Strabar.',
        lang: 'it-IT',
        faq: FAQ,
      })}
    />
  );
}
