// Pagina CITTÀ dei locali: /locali/venezia, /locali/dolo…
//
// È il collante SEO dell'operazione partner: una pagina per città che raccoglie tutti i
// locali Strabar della zona, con i numeri veri (brindisi, atleti, voto). Google la usa
// per scoprire tutte le schede dei locali partendo da un solo link, e chi cerca "bar a
// Dolo" trova una pagina che parla proprio di quello.
//
// EGRESS: zero query proprie. Usa la stessa directory in cache di lib/publicVenues che
// serve alle schede dei locali e alla sitemap — una lettura all'ora per TUTTE le città.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getVenuesByCity } from '@/lib/publicVenues';
import { slugify } from '@/lib/slug';

export const revalidate = 3600;

// Una città entra tra le pagine pubbliche solo se ha abbastanza contenuto: sotto i 2
// locali è una pagina povera, che fa più male che bene in SERP.
const MIN_VENUES = 2;

async function load(slug) {
  const groups = await getVenuesByCity();
  const group = groups.find((g) => slugify(g.city) === slug);
  if (!group || group.venues.length < MIN_VENUES) return null;
  return group;
}

export async function generateStaticParams() {
  // Prerendering delle città che esistono al momento del build: le altre vengono
  // generate su richiesta (e poi restano in cache un'ora come tutte le altre).
  const groups = await getVenuesByCity();
  return groups
    .filter((g) => g.venues.length >= MIN_VENUES)
    .slice(0, 50)
    .map((g) => ({ citta: slugify(g.city) }));
}

export async function generateMetadata({ params }) {
  const { citta } = await params;
  const group = await load(citta);
  if (!group) return { title: 'Città non trovata | Strabar', robots: { index: false } };

  const n = group.venues.length;
  const title = `Bar e locali a ${group.city}: classifiche e recensioni | Strabar`;
  const description = `${n} locali a ${group.city} con classifica degli atleti da bar, drink più bevuti e recensioni di chi c'è stato davvero. Scegli dove bere stasera e scala la classifica.`;
  return {
    title,
    description,
    alternates: { canonical: `/locali/${citta}` },
    openGraph: { title, description, url: `/locali/${citta}`, type: 'website', locale: 'it_IT', siteName: 'Strabar' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CityVenuesPage({ params }) {
  const { citta } = await params;
  const group = await load(citta);
  if (!group) notFound();

  const totalSessions = group.venues.reduce((s, v) => s + (v.sessionsCount || 0), 0);
  const totalAthletes = group.venues.reduce((s, v) => s + (v.uniqueDrinkers || 0), 0);

  return (
    <div style={{ maxWidth: '620px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link href="/locali" style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginTop: '8px' }}>
        ← Tutti i locali
      </Link>

      <header className="card" style={{ padding: '22px 20px', border: '1px solid var(--primary)' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#FFF', lineHeight: 1.15, marginBottom: '8px' }}>
          Bar e locali a {group.city}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: 1.5 }}>
          {group.venues.length} locali, {totalSessions} brindisi registrati e {totalAthletes} atleti da bar.
          Ogni locale ha la sua classifica: chi beve di più, cosa si beve, e cosa ne pensa chi c&apos;è stato.
        </p>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {group.venues.map((v) => (
          <Link
            key={v.key}
            href={`/locale/${encodeURIComponent(v.key)}`}
            className="card"
            style={{ padding: '14px', textDecoration: 'none', display: 'block' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', margin: 0 }}>{v.name}</h2>
              {v.avgRating > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, flexShrink: 0 }}>
                  ★ {v.avgRating} ({v.reviewsCount})
                </span>
              )}
            </div>
            {v.address && (
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: '3px 0 0' }}>{v.address}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: '6px 0 0' }}>
              {v.sessionsCount} brindisi · {v.uniqueDrinkers} atleti
              {v.topDrink ? ` · più bevuto: ${v.topDrink}` : ''}
            </p>
          </Link>
        ))}
      </section>

      <Link
        href="/auth"
        className="btn btn-primary"
        style={{ padding: '14px', borderRadius: '30px', fontSize: '16px', fontWeight: 700, textAlign: 'center' }}
      >
        Entra in classifica a {group.city}
      </Link>

      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
        Strabar è un gioco tra amici: bevi responsabilmente, mai metterti alla guida dopo aver bevuto.
      </p>
    </div>
  );
}
