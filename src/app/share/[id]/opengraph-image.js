// Anteprima social della sessione condivisa. È il pezzo che chiude il ciclo virale: uno
// condivide la sua serata in chat e chi la riceve vede i numeri, non l'icona dell'app.
// Solo sessioni pubbliche (ci pensa la RLS lato Supabase): il resto resta generico.

import { ImageResponse } from 'next/og';
import { getPublicSession, drinkCount } from '@/lib/publicSessions';
import { isFreeSession } from '@/lib/sessionLabels';
import { publicName } from '@/lib/names';
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

export const alt = 'Sessione su Strabar';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

export default async function Image({ params }) {
  const { id } = await params;
  const session = await getPublicSession(id);

  if (!session) {
    return new ImageResponse(
      ogCard({
        kicker: 'Strabar',
        title: 'Il social degli atleti da bar',
        subtitle: 'Traccia le tue bevute, sfida gli amici, scala la classifica del tuo locale',
      }),
      size
    );
  }

  const who = publicName(session.profiles);
  const venue = !isFreeSession(session.location) ? session.location?.name : '';
  const bac = Number(session.bac_level || 0);

  return new ImageResponse(
    ogCard({
      kicker: venue ? `Da ${venue}` : 'Sessione',
      title: who,
      subtitle: String(session.title || '').trim() || undefined,
      stats: [
        { value: drinkCount(session), label: 'drink' },
        { value: Number(session.total_units || 0).toFixed(1), label: 'unità' },
        ...(bac > 0 ? [{ value: bac.toFixed(2).replace('.', ','), label: 'picco g/l' }] : []),
      ],
    }),
    size
  );
}
