// Pagina PUBBLICA di un locale, ora resa dal SERVER.
//
// Perché: è la pagina che i clienti aprono scansionando il cartello nel bar, ed è anche
// l'unica pagina che ogni locale partner porta in dote a Strabar. Finché era solo client
// ("use client" + fetch dal browser) Google vedeva una pagina vuota: duecento cartelli
// facevano duecento check-in, ma zero traffico organico. Resa dal server, ogni locale
// diventa una pagina indicizzabile ("Classifica bevitori del Bar X a Dolo") che porta
// gente nuova da sola, per sempre.
//
// EGRESS: `revalidate = 3600` + i fetch in cache di lib/publicVenues → una lettura all'ora
// per locale, servita poi dal CDN. Meno chiamate di oggi, non di più: la prima schermata
// non fa più la sua richiesta a /api/venue/[key], perché i dati arrivano già nell'HTML.

import Script from 'next/script';
import { getPublicVenue, getVenueBoard, venueCity } from '@/lib/publicVenues';
import { slugify } from '@/lib/slug';
import VenueClient from './VenueClient';

export const revalidate = 3600;

const decodeKey = (key) => decodeURIComponent(key || '').trim();

// Descrizione in italiano: è la lingua della SERP che ci interessa per i locali italiani
// (come già fanno /percorso e le landing SEO).
function describe(venue, board) {
  const city = venueCity(venue);
  const where = city ? ` a ${city}` : '';
  const n = board?.sessionsCount || venue?.sessionsCount || 0;
  const leader = board?.board?.[0]?.name;
  const bits = [];
  if (n > 0) bits.push(`${n} brindisi registrati`);
  if (leader) bits.push(`in testa ${leader}`);
  if (venue?.topDrink) bits.push(`drink più bevuto: ${venue.topDrink}`);
  const stats = bits.length ? ` ${bits.join(' · ')}.` : '';
  return `Classifica degli atleti da bar del ${venue?.name || 'locale'}${where}.${stats} Registra la tua bevuta e scala la classifica del locale su Strabar.`;
}

export async function generateMetadata({ params }) {
  const { key } = await params;
  const placeKey = decodeKey(key);
  const [venue, board] = await Promise.all([
    getPublicVenue(placeKey),
    getVenueBoard(placeKey, 'all'),
  ]);

  const name = board?.name || venue?.name || placeKey;
  const city = venueCity(venue);
  const title = `${name}${city ? ` a ${city}` : ''}: classifica e recensioni | Strabar`;
  const path = `/locale/${encodeURIComponent(placeKey)}`;

  // Un locale senza nemmeno un brindisi non ha contenuto: meglio non farlo indicizzare
  // (pagina sottile) piuttosto che riempire Google di schede vuote.
  const thin = !(board?.sessionsCount > 0);

  return {
    title,
    description: describe(venue, board),
    alternates: { canonical: path },
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description: describe(venue, board),
      url: path,
      type: 'website',
      locale: 'it_IT',
      siteName: 'Strabar',
    },
    twitter: { card: 'summary_large_image', title, description: describe(venue, board) },
  };
}

export default async function VenuePublicPage({ params }) {
  const { key } = await params;
  const placeKey = decodeKey(key);
  const [venue, board] = await Promise.all([
    getPublicVenue(placeKey),
    getVenueBoard(placeKey, 'all'),
  ]);

  const city = venueCity(venue);
  const name = board?.name || venue?.name || placeKey;

  // Dati strutturati: con recensioni e voto medio la scheda può guadagnare le stelline
  // nella SERP, che è tutto il vantaggio competitivo di una pagina come questa.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BarOrPub',
    name,
    ...(venue?.address ? { address: venue.address } : {}),
    ...(venue?.lat && venue?.lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: Number(venue.lat), longitude: Number(venue.lng) } }
      : {}),
    ...(board?.reviewsCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: board.avgRating,
            reviewCount: board.reviewsCount,
          },
        }
      : {}),
  };

  return (
    <>
      <Script
        id="venue-jsonld"
        type="application/ld+json"
        // Contenuto nostro, già aggregato dal DB: nessun input utente grezzo qui dentro.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VenueClient
        placeKey={placeKey}
        initial={board}
        address={venue?.address || ''}
        city={city}
        citySlug={city ? slugify(city) : ''}
      />
    </>
  );
}
