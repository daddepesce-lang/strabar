// Anteprima social del percorso pubblico. Il link su WhatsApp mostrava l'icona dell'app
// per qualsiasi giro: ora mostra nome, città, tappe e chilometri.
// Stessa lettura in cache della pagina (lib/publicRoutes): nessuna query aggiuntiva.

import { ImageResponse } from 'next/og';
import { getPublicRoute } from '@/lib/publicRoutes';
import { routeCities } from '@/lib/cityFromAddress';
import { routeTotalKm } from '@/lib/geo';
import { idFromSlug } from '@/lib/slug';
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const alt = 'Percorso pubblico su Strabar';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }) {
  const { id } = await params;
  const route = await getPublicRoute(idFromSlug(id));

  if (!route) {
    return new ImageResponse(
      ogCard({ kicker: 'Percorso', title: 'Bacaro tour', subtitle: 'Crea il tuo giro e condividilo' }),
      size
    );
  }

  const stops = route.waypoints || [];
  const cities = routeCities(route);
  const km = routeTotalKm(stops);

  return new ImageResponse(
    ogCard({
      kicker: 'Itinerario',
      title: String(route.name || 'Itinerario').trim(),
      subtitle: stops
        .slice(0, 3)
        .map((w) => w?.name)
        .filter(Boolean)
        .join(' → '),
      stats: [
        { value: stops.length, label: 'tappe' },
        ...(km >= 0.1 ? [{ value: `${km.toFixed(1)} km`, label: 'a piedi' }] : []),
        ...(route.starts_count > 0 ? [{ value: route.starts_count, label: 'lo hanno fatto' }] : []),
      ],
      footer: cities[0] || undefined,
    }),
    size
  );
}
