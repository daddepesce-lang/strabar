import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

const FAQ = [
  { q: 'What is a pub crawl?', a: 'A pub crawl (or bar crawl) is an organised tour of several bars or pubs in one night: you have a drink at each and move on foot to the next. It’s a fun way to explore a city’s nightlife as a group.' },
  { q: 'How do I organise a pub crawl?', a: 'Pick an area dense with venues, choose 4-6 bars, put them in order to minimise walking, and decide how many drinks to have per stop. With Strabar you search pubs on the map, add them as stops, and the app computes the route, distance and time.' },
  { q: 'How many bars should a pub crawl include?', a: 'Usually 4 to 7. In Strabar you can set a drink target per stop so the group stays together and the crawl stays fun from start to finish.' },
  { q: 'Do I need an app for a pub crawl?', a: 'Not required, but it helps a lot: with Strabar you plan the route, share it with a link, start it in guided mode and keep count of the drinks. No more organising it all in a group chat.' },
  { q: 'Is Strabar free?', a: 'Yes: following, sharing and living pub crawls is free. The advanced planner with venue search on the map is part of Strabar Premium.' },
];

export const metadata = {
  title: 'Pub Crawl: how to plan a bar crawl | Strabar',
  description: 'Pub crawl and bar crawl: what it is, how to plan the route stop by stop, and how to build, share and live it with the Strabar app.',
  keywords: 'pub crawl, bar crawl, pub crawl app, pub crawl planner, how to organise a pub crawl, bar crawl route',
  alternates: {
    canonical: '/en/pub-crawl',
    languages: { 'it-IT': '/pub-crawl', en: '/en/pub-crawl', 'x-default': '/pub-crawl' },
  },
  openGraph: {
    title: 'Pub Crawl: how to plan a bar crawl | Strabar',
    description: 'Plan, share and live your pub crawl with Strabar.',
    url: '/en/pub-crawl',
    type: 'article',
    locale: 'en_US',
  },
};

export default function PubCrawlEnPage() {
  return (
    <SeoLanding
      eyebrow="Pub Crawl"
      h1="Pub Crawl: plan your bar crawl, stop by stop"
      lead="One bar after another, with friends and no hassle. Strabar is the app to plan the perfect pub crawl: search venues on the map, build the route and live it in guided mode."
      ctas={[
        { label: '🗺️ Build your pub crawl', href: '/routes', primary: true },
        { label: 'Get the app', href: '/install' },
      ]}
      sections={[
        {
          id: 'what',
          h2: 'What is a pub crawl',
          paragraphs: [
            'A pub crawl — also called a bar crawl — is a route through several bars or pubs in one night: you have one drink per venue and walk on to the next stop. Born in the English-speaking world, it’s now a nightlife classic everywhere.',
            'The idea is to explore many different venues instead of spending the whole night in one: each stop has its own atmosphere, its own speciality, its own crowd.',
          ],
        },
        {
          id: 'good-crawl',
          h2: 'What makes a good pub crawl',
          list: [
            { t: 'Close venues', d: 'pick an area rich in bars so you walk little between stops.' },
            { t: 'The right order', d: 'sequence the stops logically so you never double back.' },
            { t: 'A steady pace', d: 'one drink per stop keeps the group together to the end.' },
            { t: 'A shared plan', d: 'everyone knows where you’re going — no waiting, no lost chat messages.' },
          ],
        },
        {
          id: 'with-strabar',
          h2: 'How to plan a pub crawl with Strabar',
          paragraphs: [
            'Strabar turns “let’s do a bar crawl tonight” into a ready-made itinerary. Search pubs on the map, add them as stops, and instantly see walking distance, estimated time and the best route order.',
            'Save the pub crawl, share it with a link and start it in guided mode: the app walks the group stop by stop and keeps count of the drinks, with leaderboards and challenges between friends.',
          ],
        },
      ]}
      stepsTitle="How it works, in 4 steps"
      steps={[
        { title: 'Find the pubs', desc: 'Search bars and pubs on the map by name or by area of the city.' },
        { title: 'Build the stops', desc: 'Add venues and order them: Strabar computes walking distance and time.' },
        { title: 'Set the pace', desc: 'Choose how many drinks per stop and keep the group together.' },
        { title: 'Live & share', desc: 'Start the guided tour, invite friends and share the route with a link.' },
      ]}
      faq={FAQ}
      faqTitle="Pub crawl FAQ"
      finalCta={{
        title: 'Plan the perfect pub crawl',
        sub: 'Build your bar crawl, save it and share it with the group. Free to follow, simple to create.',
        button: { label: '🗺️ Start on Strabar', href: '/routes' },
      }}
      relatedTitle="Keep exploring"
      related={[
        { label: 'Do a bacaro tour in Venice', href: '/en/bacaro-tour' },
        { label: 'Pub crawl (Italiano)', href: '/pub-crawl' },
        { label: 'Strabar Premium', href: '/premium' },
      ]}
      jsonLd={landingJsonLd({
        path: '/en/pub-crawl',
        name: 'Pub Crawl: how to plan a bar crawl',
        description: 'Guide to the pub crawl: what it is, how to plan the route stop by stop, and how to build it with Strabar.',
        lang: 'en',
        faq: FAQ,
      })}
    />
  );
}
