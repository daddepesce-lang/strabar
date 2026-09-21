// Metadati della sessione condivisa.
//
// Canonical proprio: senza questo erediterebbe il canonical "/" del layout radice e Google
// la tratterebbe come duplicato della home.
//
// Titolo e descrizione veri (non più quelli generici dell'app): il link condiviso in chat
// deve dire chi ha bevuto, dove e quanto — è ciò che lo fa aprire. Solo per le sessioni
// PUBBLICHE: getPublicSession legge con la chiave anon, quindi la RLS non restituisce
// nulla per le sessioni private o riservate agli amici, e il testo resta generico.
import { getPublicSession, drinkCount } from '@/lib/publicSessions';
import { isFreeSession } from '@/lib/sessionLabels';
import { publicName } from '@/lib/names';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const canonical = `/share/${id}`;
  const session = await getPublicSession(id);
  if (!session) return { alternates: { canonical } };

  const who = publicName(session.profiles);
  const venue = !isFreeSession(session.location) ? session.location?.name : '';
  const drinks = drinkCount(session);
  const title = `${who}${venue ? ` da ${venue}` : ''} su Strabar`;
  const description = `${drinks} drink · ${Number(session.total_units || 0).toFixed(1)} unità alcoliche${
    session.bac_level ? ` · picco ${Number(session.bac_level).toFixed(2).replace('.', ',')} g/l` : ''
  }. Guarda la sessione e sfidalo su Strabar.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'article', locale: 'it_IT', siteName: 'Strabar' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function ShareLayout({ children }) {
  return children;
}
