import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

const FAQ = [
  { q: 'What is a bacaro tour?', a: 'A bacaro tour is a crawl through Venice’s bacari — the city’s traditional wine bars — stopping at each for an “ombra” (a small glass of wine) and some cicchetti, the local Venetian bar snacks. You walk from place to place, tasting a little at each stop. It’s Venice’s answer to the pub crawl: more wine, more food, a slower pace.' },
  { q: 'How do I plan a bacaro tour in Venice?', a: 'Pick an area (Rialto, Cannaregio, San Polo), choose 4-6 bacari close together, put them in order to minimise walking, and decide how many ombre and cicchetti to have per stop. With Strabar you search venues on the map, add them as stops, and the app shows walking distance and the best order.' },
  { q: 'How many bacari should a tour include?', a: 'Usually 4 to 7 stops — enough to taste plenty of different specialities without overdoing it. In Strabar you can set a drink target per stop to keep the pace under control.' },
  { q: 'What’s the difference between a bacaro tour and a pub crawl?', a: 'The idea is the same — a crawl between venues — but a bacaro tour is the Venetian tradition of wine, cicchetti and historic osterie, while a pub crawl is more international and beer-and-pub focused. Strabar lets you build both.' },
  { q: 'Is Strabar free?', a: 'Yes: following, sharing and living tours is free. The advanced planner that lets you build custom routes with venue search on the map is part of Strabar Premium.' },
];

export const metadata = {
  title: 'Venice Bacaro Tour: what it is & how to plan it | Strabar',
  description: 'A bacaro tour is Venice’s cicchetti and wine-bar crawl. Learn what it is, how to plan it stop by stop, and build your own itinerary with Strabar.',
  keywords: 'bacaro tour, bacaro tour venice, venice bacaro tour, cicchetti tour venice, venice bar crawl, venice wine bar crawl, bacari venice',
  alternates: {
    canonical: '/en/bacaro-tour',
    languages: { 'it-IT': '/bacaro-tour', en: '/en/bacaro-tour', 'x-default': '/bacaro-tour' },
  },
  openGraph: {
    title: 'Venice Bacaro Tour: what it is & how to plan it | Strabar',
    description: 'Venice’s cicchetti and wine-bar crawl. Build your own itinerary with Strabar.',
    url: '/en/bacaro-tour',
    type: 'article',
    locale: 'en_US',
  },
};

export default function BacaroTourEnPage() {
  return (
    <SeoLanding
      eyebrow="Bacaro Tour"
      h1="Venice Bacaro Tour: the cicchetti & wine-bar crawl, planned"
      lead="One ombra, one cicchetto, one bacaro at a time — a bacaro tour is the most authentic way to experience Venice. Strabar helps you discover the bars, build the perfect route and share it with friends."
      ctas={[
        { label: '🗺️ Build your bacaro tour', href: '/routes', primary: true },
        { label: 'Get the app', href: '/install' },
      ]}
      sections={[
        {
          id: 'what',
          h2: 'What is a bacaro tour',
          paragraphs: [
            'A bacaro tour is a crawl through Venice’s bacari — the traditional wine bars where locals stop for an “ombra” (a small glass of wine) paired with cicchetti, the little Venetian snacks served at the counter. You move on foot from one bar to the next, tasting as you go.',
            'It’s the Venetian version of a pub crawl: less beer and more wine, less rushing and more lingering. The point isn’t to drink a lot — it’s to taste many specialities in historic bars often tucked away in the calli.',
          ],
        },
        {
          id: 'essentials',
          h2: 'What every bacaro crawl needs',
          list: [
            { t: 'Ombra', d: 'a small glass of local wine — the heart of every stop.' },
            { t: 'Cicchetti', d: 'baccalà mantecato, sarde in saor, meatballs, crostini — ordered at the bar.' },
            { t: 'The right areas', d: 'the Rialto market, Cannaregio and San Polo are packed with historic bacari.' },
            { t: 'A slow pace', d: '4-6 stops close together, ordered to keep walking to a minimum.' },
          ],
        },
        {
          id: 'with-strabar',
          h2: 'How to build a bacaro tour with Strabar',
          paragraphs: [
            'Strabar turns a spontaneous bacaro crawl into a real itinerary. Search venues on the map, add them as stops, and instantly see walking distance, estimated time and the best route order.',
            'Save your bacaro tour, share it with a link, and even start it in guided mode: the app walks you stop by stop and keeps count of your ombre.',
          ],
        },
      ]}
      stepsTitle="How it works, in 4 steps"
      steps={[
        { title: 'Find the bacari', desc: 'Search osterie and wine bars on the map by name or by area (Rialto, Cannaregio…).' },
        { title: 'Build the stops', desc: 'Add venues to your route and order them: Strabar computes walking distance and time.' },
        { title: 'Set the pace', desc: 'Choose how many ombre/cicchetti per stop and keep the crawl under control.' },
        { title: 'Live & share', desc: 'Start the guided tour, invite friends and share the route with a link.' },
      ]}
      faq={FAQ}
      faqTitle="Bacaro tour FAQ"
      finalCta={{
        title: 'Ready for your bacaro crawl?',
        sub: 'Build your Venice bacaro tour, save it and share it with anyone. Free to follow, simple to create.',
        button: { label: '🗺️ Start on Strabar', href: '/routes' },
      }}
      relatedTitle="Keep exploring"
      related={[
        { label: 'Plan a pub crawl', href: '/en/pub-crawl' },
        { label: 'Bacaro tour (Italiano)', href: '/bacaro-tour' },
        { label: 'Strabar Premium', href: '/premium' },
      ]}
      jsonLd={landingJsonLd({
        path: '/en/bacaro-tour',
        name: 'Venice Bacaro Tour: what it is & how to plan it',
        description: 'Guide to the Venice bacaro tour: what it is, how to plan the cicchetti and wine-bar crawl, and how to build it with Strabar.',
        lang: 'en',
        faq: FAQ,
      })}
    />
  );
}
