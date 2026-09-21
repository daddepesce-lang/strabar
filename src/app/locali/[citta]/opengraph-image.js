// Anteprima social della pagina città: "Bar e locali a Venezia — 12 locali, 340 brindisi".
// Usa la directory già in cache: nessuna query in più.

import { ImageResponse } from 'next/og';
import { getVenuesByCity } from '@/lib/publicVenues';
import { slugify } from '@/lib/slug';
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const alt = 'Locali della città su Strabar';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }) {
  const { citta } = await params;
  const groups = await getVenuesByCity();
  const group = groups.find((g) => slugify(g.city) === citta);

  if (!group) {
    return new ImageResponse(
      ogCard({ kicker: 'Strabar', title: 'Locali', subtitle: 'Classifiche e recensioni dei bar della tua città' }),
      size
    );
  }

  const sessions = group.venues.reduce((s, v) => s + (v.sessionsCount || 0), 0);
  const athletes = group.venues.reduce((s, v) => s + (v.uniqueDrinkers || 0), 0);

  return new ImageResponse(
    ogCard({
      kicker: 'Bar e locali',
      title: group.city,
      subtitle: group.venues.slice(0, 3).map((v) => v.name).join(' · '),
      stats: [
        { value: group.venues.length, label: 'locali' },
        { value: sessions, label: 'brindisi' },
        { value: athletes, label: 'atleti' },
      ],
    }),
    size
  );
}
