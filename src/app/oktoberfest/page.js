import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

// Cifre della sezione "quanto ci vuole" calcolate col modello dell'app (src/lib/bac.js):
// Maß da 1L al 6% bevuta in ~1h, una ogni 90 min. Sono ordini di grandezza, non promesse.
const FAQ = [
  { q: 'Quando si svolge l’Oktoberfest 2026?', a: 'L’Oktoberfest 2026 di Monaco di Baviera si svolge dal 19 settembre al 4 ottobre 2026 sulla Theresienwiese (la “Wiesn”). Il secondo weekend, il 26 e 27 settembre, è il tradizionale “weekend degli italiani”, quello in cui arrivano più visitatori dall’Italia.' },
  { q: 'Quanta birra c’è in una Maß e quanto alcol contiene?', a: 'Una Maß è un boccale da 1 litro. La Festbier servita nei tendoni ha di solito tra il 5,8% e il 6,4% di alcol: una Maß contiene quindi circa 47-50 grammi di alcol puro, come 4 birre medie da 0,33L o 4-5 calici di vino.' },
  { q: 'Dopo quante Maß posso guidare?', a: 'Dipende da peso, sesso, stomaco pieno o vuoto e ritmo. Per un uomo di 70-80 kg anche una sola Maß può portare il tasso sopra 0,5 g/L; con due Maß servono in genere 6-8 ore dopo l’ultimo sorso per tornare sotto il limite, con tre si va oltre le 10 ore, cioè la mattina dopo. Per una donna di 60 kg una sola Maß richiede circa 6 ore. Strabar calcola sul tuo profilo l’ora stimata in cui torni sotto 0,5, ma è solo una stima: se devi guidare, non bere.' },
  { q: 'Qual è il limite di alcol alla guida in Germania?', a: 'In Germania il limite generale è 0,5 g/L (0,5 per mille), come in Italia e in Austria. Per i neopatentati in periodo di prova e per chi ha meno di 21 anni il limite è zero. Già da 0,3 g/L, se ci sono segni di guida alterata, scattano sanzioni penali. Le regole possono cambiare: verifica sempre le norme in vigore.' },
  { q: 'Cos’è la Radler Maß?', a: 'È una Maß “tagliata”: metà birra e metà limonata, per circa il 2,5% di alcol. È il trucco più usato dai locali per restare nel tendone fino a sera senza esagerare. Su Strabar la trovi nel selettore Festbier / Maß.' },
  { q: 'Strabar è gratis?', a: 'Sì: registrare le Maß, vedere il tasso stimato in tempo reale e l’ora in cui torni sotto 0,5, ricevere l’avviso quando superi il limite e condividere la storia della serata è gratuito.' },
];

export const metadata = {
  title: 'Oktoberfest 2026: Maß, tasso alcolemico e quando puoi ripartire | Strabar',
  description: 'Oktoberfest 2026 (19 settembre – 4 ottobre): quanto alcol c’è in una Maß, dopo quante ore torni sotto 0,5 e come calcolarlo sul tuo profilo con Strabar, prima di rimetterti al volante.',
  keywords: 'oktoberfest 2026, oktoberfest date 2026, weekend degli italiani oktoberfest, maß oktoberfest, quanto alcol in una maß, tasso alcolemico oktoberfest, dopo quante birre posso guidare, limite alcol germania, radler maß, wiesn 2026',
  alternates: {
    canonical: '/oktoberfest',
    languages: { 'it-IT': '/oktoberfest', en: '/en/oktoberfest', 'x-default': '/oktoberfest' },
  },
  openGraph: {
    title: 'Oktoberfest 2026: bevi la Maß, Strabar ti dice quando puoi ripartire',
    description: 'Registra le Maß, guarda il tasso stimato e scopri a che ora torni sotto 0,5.',
    url: '/oktoberfest',
    type: 'article',
    locale: 'it_IT',
  },
};

export default function OktoberfestPage() {
  return (
    <SeoLanding
      eyebrow="Oktoberfest 2026 · Wiesn"
      h1="Bevi la Maß. Strabar ti dice quando puoi ripartire."
      lead="Dal 19 settembre al 4 ottobre Monaco è la capitale della birra. Una Maß vale quattro birre: registra quelle che bevi, guarda il tuo tasso stimato in tempo reale e sappi a che ora torni sotto 0,5 prima di rimetterti in macchina, in camper o sul pullman di ritorno dal Brennero."
      ctas={[
        { label: '🍺 Traccia le tue Maß', href: '/', primary: true },
        { label: 'Scarica l’app', href: '/install' },
      ]}
      sections={[
        {
          id: 'date',
          h2: 'Oktoberfest 2026: date e weekend degli italiani',
          paragraphs: [
            'L’Oktoberfest 2026 apre sabato 19 settembre con il tradizionale “O’zapft is!” e chiude domenica 4 ottobre, sulla Theresienwiese di Monaco di Baviera. Il secondo weekend, il 26 e 27 settembre, è il cosiddetto weekend degli italiani: tendoni pieni, targhe italiane ovunque e la strada del Brennero trafficata in entrambe le direzioni.',
            'Molti arrivano in auto o in camper e ripartono il giorno dopo. È qui che il conto delle Maß smette di essere un gioco: il tasso alcolemico della sera prima può essere ancora sopra il limite la mattina.',
          ],
        },
        {
          id: 'mass',
          h2: 'Quanto alcol c’è in una Maß',
          list: [
            { t: '1 Maß = 1 litro', d: 'di Festbier, la birra speciale brassata per la Wiesn, più forte di una lager normale (5,8-6,4%).' },
            { t: '≈ 48 g di alcol puro', d: 'come 4 birre medie da 0,33L, oppure 4-5 calici di vino.' },
            { t: 'Radler Maß', d: 'metà birra e metà limonata, circa 2,5%: meno della metà dell’alcol a parità di litro.' },
            { t: 'Halbe', d: 'mezzo litro, dove lo servono: utile per rallentare il ritmo.' },
          ],
        },
        {
          id: 'ripartire',
          h2: 'Dopo quante ore torni sotto 0,5?',
          paragraphs: [
            'Stime indicative, calcolate con lo stesso modello che usa l’app, per una Maß al 6% bevuta in circa un’ora e una ogni 90 minuti. Il tempo è contato dalla fine dell’ultima Maß.',
          ],
          list: [
            { t: 'Uomo 70-80 kg, 1 Maß', d: 'picco tra 0,7 e 0,9 g/L: già sopra il limite. Sotto 0,5 dopo circa 2 ore.' },
            { t: 'Uomo 70-80 kg, 2 Maß', d: 'picco tra 1,4 e 1,7 g/L. Sotto 0,5 dopo 6-8 ore.' },
            { t: 'Uomo 70-80 kg, 3 Maß', d: 'picco oltre 2 g/L. Più di 10 ore: la mattina dopo non si guida.' },
            { t: 'Donna 60 kg, 1 Maß', d: 'picco intorno a 1,3 g/L. Sotto 0,5 dopo circa 6 ore.' },
            { t: 'Donna 60 kg, 2 Maß', d: 'picco oltre 2,5 g/L. Più di 10 ore.' },
          ],
        },
        {
          id: 'limiti',
          h2: 'I limiti alla guida in Germania, Austria e Italia',
          paragraphs: [
            'In tutti e tre i Paesi che attraversi per tornare a casa il limite generale è 0,5 g/L. Per i neopatentati e per chi ha meno di 21 anni è zero, in Germania come in Italia. In Germania, già da 0,3 g/L con segni di guida alterata si rischia il procedimento penale.',
            'Strabar non è un etilometro e non sostituisce un test: ti dà una stima basata su peso, sesso, stomaco e orari dei drink. Serve a decidere con più informazioni, non a sfidare il limite. Se devi guidare, la regola migliore resta non bere.',
          ],
        },
        {
          id: 'con-strabar',
          h2: 'Come usare Strabar alla Wiesn',
          paragraphs: [
            'Apri una sessione quando entri nel tendone e aggiungi ogni Maß con un tocco dal selettore “Festbier / Maß”. Strabar aggiorna in tempo reale il tasso stimato, ti mostra a che ora torni sotto 0,5 e ti manda una notifica quando superi il limite, anche ad app chiusa.',
            'A fine serata condividi la tua storia “Wiesn 2026”: le Maß della serata, i tuoi amici e l’ora stimata in cui torni sotto 0,5. In più sblocchi il badge stagionale Wiesn 2026 🥨, disponibile solo fino al 4 ottobre.',
          ],
        },
      ]}
      stepsTitle="Alla Wiesn in 4 passi"
      steps={[
        { title: 'Apri la sessione', desc: 'Entrato nel tendone, avvia una sessione live: gli amici possono seguirti.' },
        { title: 'Aggiungi le Maß', desc: 'Festbier 0,5L, Maß 1L o Radler Maß: un tocco e il conto è fatto.' },
        { title: 'Guarda il tasso', desc: 'La stima si aggiorna in tempo reale, con l’ora in cui torni sotto 0,5.' },
        { title: 'Condividi e riparti', desc: 'Pubblica la storia Wiesn 2026 e sappi da che ora potresti rimetterti al volante.' },
      ]}
      faq={FAQ}
      faqTitle="Domande frequenti sull’Oktoberfest"
      finalCta={{
        title: 'O’zapft is! 🍻',
        sub: 'Registra le tue Maß, tieni d’occhio il tasso e torna a casa quando è il momento giusto. Gratis.',
        button: { label: '🍺 Inizia la tua Wiesn su Strabar', href: '/' },
      }}
      relatedTitle="Continua a esplorare"
      related={[
        { label: 'Oktoberfest (English)', href: '/en/oktoberfest' },
        { label: 'Organizza un pub crawl', href: '/pub-crawl' },
        { label: 'Bacaro tour a Venezia', href: '/bacaro-tour' },
        { label: 'Scarica l’app', href: '/install' },
      ]}
      jsonLd={landingJsonLd({
        path: '/oktoberfest',
        name: 'Oktoberfest 2026: Maß, tasso alcolemico e quando puoi ripartire',
        description: 'Guida all’Oktoberfest 2026: date, alcol in una Maß, ore per tornare sotto 0,5 g/L e limiti alla guida in Germania, Austria e Italia.',
        lang: 'it-IT',
        faq: FAQ,
      })}
    />
  );
}
