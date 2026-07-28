// PAGINA PUBBLICA DI UN PERCORSO — il motore del ciclo virale.
//
// Il problema che risolve: il pulsante "Condividi percorso" mandava su /routes, che è
// dietro login. Chi riceveva il link su WhatsApp senza avere un account vedeva
// "registrati", NON il giro: ogni condivisione dei nostri utenti finiva nel muro.
//
// Qui invece il visitatore vede TUTTO il valore prima di iscriversi — tappe, indirizzi,
// distanza, e può aprire il giro in Google Maps senza account. L'iscrizione la chiediamo
// solo per la cosa che richiede davvero l'app: vivere il tour guidato. Dare valore prima
// è ciò che rende il link degno di essere condiviso (e indicizzato).
//
// COSTI: server component in ISR. La riga del percorso è in cache 1 ora (vedi
// lib/publicRoutes.js), quindi cento aperture dello stesso link = una lettura Supabase.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Beer, Footprints, Flame, ArrowRight } from 'lucide-react';
import { getPublicRoute } from '@/lib/publicRoutes';
import { routeCities } from '@/lib/cityFromAddress';
import { routeTotalKm, travelMinutes } from '@/lib/geo';
import { idFromSlug, routePublicPath } from '@/lib/slug';
import { routeJsonLd } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';

export const revalidate = 3600;

// Dati derivati usati sia dai metadati sia dalla pagina (il fetch sotto è in cache,
// quindi chiamarlo due volte per la stessa richiesta non costa una seconda query).
async function load(idParam) {
  const id = idFromSlug(idParam);
  if (!id) return null;
  const route = await getPublicRoute(id);
  if (!route) return null;
  // I nomi inseriti a mano hanno spesso spazi in coda ("Tour dello Squero Dolo "):
  // ripuliamoli, perché finiscono nel <title> e nell'anteprima su WhatsApp.
  route.name = String(route.name || 'Itinerario').trim();
  route.description = route.description ? String(route.description).trim() : '';
  const stops = (route.waypoints || []).map((w) => ({
    name: w?.name || 'Tappa',
    address: (w?.address || w?.note || '').trim(),
    lat: w?.lat != null ? Number(w.lat) : null,
    lng: (w?.lng ?? w?.lon) != null ? Number(w.lng ?? w.lon) : null,
    units: w?.units != null ? Number(w.units) : null,
  }));
  const cities = routeCities(route);
  const km = routeTotalKm(route.waypoints || []);
  return { route, stops, cities, km, path: routePublicPath(route, cities) };
}

// Riassunto in una riga: è il testo che compare sotto il link su WhatsApp e in Google.
// Deve far capire in un colpo d'occhio dove si va e quanto è impegnativo.
function summary({ stops, cities, km }) {
  const where = cities.length ? ` a ${cities.slice(0, 2).join(' e ')}` : '';
  const dist = km >= 0.1 ? `, ${km.toFixed(1)} km a piedi` : '';
  return `Itinerario di ${stops.length} tappe${where}${dist}. Vedi le tappe una per una, aprilo in Google Maps e vivilo con gli amici su Strabar.`;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: 'Percorso non trovato | Strabar', robots: { index: false } };

  const { route, cities, path } = data;
  // La città entra nel titolo solo se il nome non la dice già ("Tour dello Squero Dolo"
  // non diventa "Tour dello Squero Dolo a Dolo").
  const city = cities[0];
  const cityPart = city && !route.name.toLowerCase().includes(city.toLowerCase()) ? ` a ${city}` : '';
  const title = `${route.name}${cityPart}: itinerario di ${data.stops.length} tappe | Strabar`;
  const description = route.description || summary(data);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'article',
      locale: 'it_IT',
      siteName: 'Strabar',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicRoutePage({ params }) {
  const { id } = await params;
  const data = await load(id);
  // Percorso inesistente, cancellato o non pubblico → 404 (mai "esiste ma non puoi").
  if (!data) notFound();

  const { route, stops, cities, km, path } = data;
  const walkMin = travelMinutes(km, 'foot');
  const totalUnits = stops.reduce((s, w) => s + (w.units || 0), 0);
  const doneBy = route.starts_count || 0;

  // Dopo l'iscrizione l'utente atterra sul percorso APERTO nell'app, pronto da avviare:
  // il link non si perde nel funnel di registrazione.
  const signupHref = `/auth?next=${encodeURIComponent(`/routes?routeId=${route.id}`)}`;

  // "Apri in Google Maps" con tutte le tappe: valore immediato, zero account richiesto.
  const mapsHref = (() => {
    const pts = stops.filter((s) => s.lat != null && s.lng != null);
    if (pts.length < 2) return null;
    const fmt = (s) => `${s.lat},${s.lng}`;
    const mid = pts.slice(1, -1).map(fmt).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${fmt(pts[0])}&destination=${fmt(pts[pts.length - 1])}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}&travelmode=walking`;
  })();

  const jsonLd = routeJsonLd({
    path,
    name: route.name,
    description: route.description || summary(data),
    cities,
    stops,
  });

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* INTESTAZIONE */}
      <header>
        <p style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '6px' }}>
          {cities.length ? `Bacaro tour / Pub crawl a ${cities[0]}` : 'Itinerario tra locali'}
        </p>
        <h1 style={{ fontSize: '34px', lineHeight: 1.1, fontWeight: 900, margin: 0 }}>{route.name}</h1>
        {route.description && (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: 1.55, marginTop: '12px' }}>
            {route.description}
          </p>
        )}

        {/* Città toccate */}
        {cities.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
            {cities.map((city) => (
              <span key={city} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: 700, color: 'var(--primary)',
                background: 'rgba(255,59,47,0.10)', border: '1px solid rgba(255,59,47,0.30)',
                borderRadius: '999px', padding: '4px 10px',
              }}>
                <MapPin size={12} /> {city}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* NUMERI DEL GIRO: quello che uno vuole sapere prima di dire "ci sto" */}
      <div className="card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '14px' }}>
        <div>
          <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={13} color="var(--primary)" /> Tappe</span>
          <strong className="stat-value" style={{ fontSize: '20px' }}>{stops.length}</strong>
        </div>
        <div>
          <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Footprints size={13} color="var(--primary)" /> A piedi</span>
          <strong className="stat-value" style={{ fontSize: '20px' }}>{km.toFixed(1)} km</strong>
        </div>
        <div>
          <span className="stat-label">⏱️ Durata stimata</span>
          <strong className="stat-value" style={{ fontSize: '20px' }}>~{walkMin} min</strong>
        </div>
        {totalUnits > 0 && (
          <div>
            <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Beer size={13} color="var(--secondary)" /> Carico</span>
            <strong className="stat-value" style={{ fontSize: '20px', color: 'var(--secondary)' }}>{totalUnits.toFixed(1)} U.A.</strong>
          </div>
        )}
        {doneBy > 0 && (
          <div>
            <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Flame size={13} color="var(--primary)" /> L&apos;hanno fatto</span>
            <strong className="stat-value" style={{ fontSize: '20px' }}>{doneBy}</strong>
          </div>
        )}
      </div>

      {/* CTA PRINCIPALE — l'account serve per VIVERE il tour, non per leggerlo */}
      <div className="card" style={{ padding: '18px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,59,47,0.10) 100%)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px' }}>Fai questo giro con i tuoi amici</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Strabar ti guida tappa per tappa, tiene il conto dei drink e ti sfida con gli amici nelle classifiche dei locali. Gratis.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <Link href={signupHref} className="btn btn-primary" style={{ borderRadius: '30px', padding: '13px 22px', fontWeight: 700, fontSize: '15px' }}>
            Avvia questo tour <ArrowRight size={16} />
          </Link>
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ borderRadius: '30px', padding: '13px 20px', fontSize: '14px' }}>
              🗺️ Apri in Google Maps
            </a>
          )}
        </div>
      </div>

      {/* LE TAPPE: il contenuto vero, aperto a tutti. È ciò che rende il link
          degno di essere condiviso e indicizzato. */}
      <section>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 12px' }}>Le tappe, in ordine</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stops.map((stop, idx) => (
            <li key={idx} className="card" style={{ padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{
                background: 'var(--primary)', color: '#fff', width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', flexShrink: 0,
              }}>
                {idx + 1}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>{stop.name}</strong>
                {stop.address && (
                  <span style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', display: 'block', marginTop: '2px' }}>
                    {stop.address}
                  </span>
                )}
                {stop.units > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    <Beer size={12} /> {stop.units.toFixed(1)} U.A. previste
                  </span>
                )}
              </div>
              {stop.lat != null && stop.lng != null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Naviga verso ${stop.name}`}
                  style={{ fontSize: '18px', textDecoration: 'none', flexShrink: 0 }}
                >
                  🧭
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* CHIUSURA + link interni (aiutano il visitatore e l'indicizzazione) */}
      <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px' }}>Vuoi crearne uno tuo?</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Cerca i locali sulla mappa, mettili in fila e condividi il tuo itinerario con un link come questo.
        </p>
        <Link href={signupHref} className="btn btn-primary" style={{ borderRadius: '30px', padding: '12px 22px', fontWeight: 700 }}>
          Inizia gratis su Strabar
        </Link>
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '14px', marginTop: '18px', fontSize: '13px' }}>
          <Link href="/bacaro-tour" style={{ color: 'var(--text-dark-secondary)' }}>Cos&apos;è un bacaro tour</Link>
          <Link href="/pub-crawl" style={{ color: 'var(--text-dark-secondary)' }}>Organizzare un pub crawl</Link>
          <Link href="/install" style={{ color: 'var(--text-dark-secondary)' }}>Scarica l&apos;app</Link>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', margin: 0 }}>
        Itinerario condiviso pubblicamente da un utente di <a href={SITE_URL} style={{ color: 'var(--primary)' }}>Strabar</a>.
        Bevi responsabilmente: mai alla guida.
      </p>
    </div>
  );
}
