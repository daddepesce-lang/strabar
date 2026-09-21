// Anteprima social della scheda locale: è ciò che si vede quando il link del cartello
// finisce in una chat di gruppo ("Da Momi's — 47 atleti, in testa @marco").
// Dati dalla stessa lettura in cache della pagina: nessuna query in più.

import { ImageResponse } from 'next/og';
import { getVenueBoard, getPublicVenue, venueCity } from '@/lib/publicVenues';
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const alt = 'Classifica del locale su Strabar';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }) {
  const { key } = await params;
  const placeKey = decodeURIComponent(key || '').trim();
  const [board, venue] = await Promise.all([
    getVenueBoard(placeKey, 'all'),
    getPublicVenue(placeKey),
  ]);

  const name = board?.name || venue?.name || placeKey;
  const city = venueCity(venue);
  const leader = board?.board?.[0];

  return new ImageResponse(
    ogCard({
      kicker: 'Classifica del locale',
      title: name,
      subtitle: leader
        ? `In testa ${leader.name} con ${leader.units} unità`
        : 'Nessuno in classifica: il primo brindisi è libero',
      stats: [
        { value: board?.sessionsCount || 0, label: 'brindisi' },
        { value: board?.totalDrinks || 0, label: 'drink' },
        // Il tasso medio è il numero più riconoscibile dell'app: quando c'è, vince sul voto.
        ...(board?.avgBac != null
          ? [{ value: `${String(board.avgBac).replace('.', ',')} g/l`, label: 'tasso medio' }]
          : board?.reviewsCount > 0
          ? [{ value: board.avgRating, label: 'voto medio' }]
          : []),
      ],
      footer: city || undefined,
    }),
    size
  );
}
