'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { Beer, MessageSquare, Share2, Trophy, Flame, User, Plus, Award, Calendar, Volume2, Camera, Video } from 'lucide-react';

// Mappa Leaflet reale (caricata solo lato client)
const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// Tappe reali del Giro dei Bacari di Venezia (coordinate GPS reali)
const VENICE_TOUR = [
  { name: 'Cantina Do Mori', lat: 45.4382, lng: 12.3353, note: 'Il più antico (1462). Imperdibile il francobollo.' },
  { name: "Osteria All'Arco", lat: 45.4384, lng: 12.3355, note: 'Famoso per i cicheti caldi al momento.' },
  { name: 'Osteria Al Mercà', lat: 45.4386, lng: 12.3360, note: 'Spritz al volo davanti al mercato di Rialto.' },
  { name: 'Cantina Aziende Agricole', lat: 45.4430, lng: 12.3300, note: 'Ottimo vino della casa e polpettine.' },
];

export default function FeedPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState({});
  const [activeCommentsSection, setActiveCommentsSection] = useState({});
  const [selectedActivity, setSelectedActivity] = useState(null);

  const loadFeed = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      
      const acts = await db.getActivities();
      setActivities(acts);
    } catch (err) {
      console.error("Errore nel caricamento del feed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const handleCheers = async (activityId) => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    try {
      await db.toggleCheers(activityId);
      // Ricarica il feed
      await loadFeed();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCommentsSection = (activityId) => {
    setActiveCommentsSection(prev => ({
      ...prev,
      [activityId]: !prev[activityId]
    }));
  };

  const handleCommentSubmit = async (e, activityId) => {
    e.preventDefault();
    const text = newCommentText[activityId];
    if (!text || !text.trim()) return;

    if (!currentUser) {
      router.push('/auth');
      return;
    }

    try {
      await db.addComment(activityId, text);
      setNewCommentText(prev => ({ ...prev, [activityId]: '' }));
      await loadFeed();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommentChange = (activityId, text) => {
    setNewCommentText(prev => ({
      ...prev,
      [activityId]: text
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) {
      return diffMins <= 0 ? 'Adesso' : `${diffMins} min fa`;
    } else if (diffHours < 24) {
      return `${diffHours} ore fa`;
    } else if (diffHours < 48) {
      return 'Ieri';
    } else {
      return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  };

  // Rileva gli atleti REGISTRATI che hanno bevuto nello stesso locale a orario simile
  // (come gli allenamenti di gruppo su Strava → "X ha bevuto con Y").
  const COMPANION_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 ore
  const getRegisteredCompanions = (act) => {
    if (!act.location?.name) return [];
    const locKey = act.location.name.trim().toLowerCase();
    const t = new Date(act.created_at).getTime();
    const seen = new Map();
    activities.forEach((other) => {
      if (other.id === act.id || other.user_id === act.user_id) return;
      if (!other.location?.name) return;
      if (other.location.name.trim().toLowerCase() !== locKey) return;
      if (Math.abs(new Date(other.created_at).getTime() - t) > COMPANION_WINDOW_MS) return;
      if (!seen.has(other.user_id)) {
        seen.set(other.user_id, {
          user_id: other.user_id,
          name: other.profiles?.display_name || other.profiles?.username || 'Atleta',
        });
      }
    });
    return Array.from(seen.values());
  };

  // Calcola statistiche per la sidebar dell'utente loggato
  const userActivities = activities.filter(a => a.user_id === currentUser?.id);
  const totalDrinksCount = userActivities.reduce((acc, act) => {
    return acc + act.drinks.reduce((dAcc, d) => dAcc + d.qty, 0);
  }, 0);
  const weeklyStreak = userActivities.filter(a => {
    const diffTime = Math.abs(new Date() - new Date(a.created_at));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }).length;

  // Classifica mock (Leaderboard) basata su unità alcoliche
  const leaderboardData = [
    { name: 'Marco Rossi', units: 14.8, isPremium: true, rank: 1 },
    { name: 'Luca Bianchi', units: 9.6, isPremium: false, rank: 2 },
    { name: 'Francesca Verdi', units: 8.2, isPremium: false, rank: 3 },
    { name: currentUser?.display_name || 'Tu', units: userActivities.reduce((acc, a) => acc + a.total_units, 0).toFixed(1), isPremium: currentUser?.is_premium || false, rank: 4 }
  ].sort((a, b) => b.units - a.units);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Versando una fresca... 🍺
        </div>
      </div>
    );
  }

  // SCHERMATA D'IMPATTO IN STILE STRAVA LANDING SE L'UTENTE NON E LOGGATO
  if (!currentUser) {
    return (
      <div className="landing-section-gap" style={{ display: 'flex', flexDirection: 'column', gap: '90px', marginTop: '-30px', paddingBottom: '90px' }}>
        
        {/* HERO SECTION */}
        <section className="r-grid-2-1" style={{ alignItems: 'center', minHeight: '80vh', padding: '40px 0', borderBottom: '1px solid var(--border-dark)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <span style={{ background: 'rgba(255, 94, 0, 0.1)', color: 'var(--primary)', padding: '6px 14px', borderRadius: '30px', fontSize: '14px', fontWeight: '700', width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px' }}>
              🎖️ Il Social Network degli Atleti da Bar
            </span>
            <h1 className="hero-title">
              Traccia le tue bevute. <br />
              Sblocca <span style={{ background: 'var(--premium-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>nuovi record</span>.
            </h1>
            <p className="hero-para">
              Unisciti a milioni di atleti del terzo tempo in tutto il mondo. Traccia le tue sessioni, analizza le unità alcoliche (U.A.) assunte e sfida gli amici nelle classifiche dei pub di tutto il mondo.
            </p>
            <div className="hero-btns">
              <Link href="/auth" className="btn btn-primary" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px', fontWeight: '700' }}>
                Comincia Ora (Gratis)
              </Link>
              <Link href="/routes" className="btn btn-secondary" style={{ padding: '16px 32px', borderRadius: '30px', fontSize: '17px' }}>
                Esplora i Percorsi
              </Link>
            </div>
          </div>

          {/* Grafica del telefono / mockup di performance */}
          <div style={{ background: 'linear-gradient(135deg, rgba(22, 24, 34, 0.9) 0%, rgba(255, 94, 0, 0.15) 100%)', border: '2px solid var(--primary)', borderRadius: '24px', padding: '30px', boxShadow: '0px 10px 40px rgba(255, 94, 0, 0.15)', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'var(--primary)', filter: 'blur(80px)', borderRadius: '50%', opacity: 0.4 }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="activity-avatar" style={{ border: '2px solid var(--primary)', width: '38px', height: '38px', fontSize: '14px' }}>M</div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Marco Rossi</h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Oggi alle 19:42</span>
                </div>
              </div>
              <span className="badge-premium" style={{ fontSize: '8px' }}>PRO</span>
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Aperitivo Sforzo Massimo 🏆</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-dark)' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Drink</span>
                <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary)' }}>5</div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)', borderRight: '1px solid var(--border-dark)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Tempo</span>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>2h 15m</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>Carico</span>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--secondary)' }}>5.2 UA</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍺 3x Birra Chiara</span>
              <span className="drink-tag" style={{ fontSize: '11px' }}>🍹 2x Spritz Campari</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
              <span>👥 Con Luca e Francesca</span>
              <span style={{ color: 'var(--primary)', fontWeight: '700' }}>Stato: Molto Caldo 🔥</span>
            </div>
          </div>
        </section>

        {/* STATS SECTION */}
        <section className="r-grid-stat-4" style={{ gap: '20px', textAlign: 'center' }}>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: 'var(--primary)' }}>12+ Mln</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Brindisi Registrati</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: '#FFF' }}>380k</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Atleti Attivi</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: 'var(--secondary)' }}>80+</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Paesi</p>
          </div>
          <div className="card" style={{ padding: '24px 16px' }}>
            <div className="landing-stat-num" style={{ color: '#10B981' }}>0.0%</div>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '5px' }}>Giudizio Morale</p>
          </div>
        </section>

        {/* DEFAULT VENICE ITINERARY PREVIEW SECTION */}
        <section className="r-grid-1-2 landing-section-padded" style={{ borderTop: '1px solid var(--border-dark)', borderBottom: '1px solid var(--border-dark)', padding: '60px 0' }}>
          <div>
            <span style={{ background: 'rgba(255, 176, 0, 0.1)', color: 'var(--secondary)', padding: '6px 12px', borderRadius: '30px', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🗺️ Itinerario di Esempio di Default
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', marginTop: '15px', marginBottom: '15px' }}>
              Giro dei Bacari Storico a Venezia 🛶
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '25px' }}>
              Esplora la laguna veneziana attraverso il nostro itinerario più celebre. Strabar ti permette di pianificare le tappe con coordinate reali del GPS dei pub, calcolare le calorie e le distanze, e tracciare le soste per l&apos;aperitivo.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>1</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Cantina Do Mori</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Il locale più antico di Venezia (fondato nel 1462). Famoso per i cicheti &quot;francobolli&quot;.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>2</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Osteria All&apos;Arco</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Tappa leggendaria per i cicheti caldi preparati al momento con ingredienti freschi del mercato.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <span style={{ background: 'var(--primary)', color: '#FFF', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', marginTop: '2px' }}>3</span>
                <div>
                  <strong style={{ color: '#FFF' }}>Osteria Al Mercà</strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Famoso per lo spritz al Select o al Campari, servito al volo in piedi proprio davanti a Rialto.</p>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '30px' }}>
              <Link href="/routes" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Vedi Tutti i Percorsi Sulla Mappa
              </Link>
            </div>
          </div>

          {/* Mappa Leaflet REALE e interattiva del tour di Venezia */}
          <div className="landing-fake-map" style={{ position: 'relative', height: '420px' }}>
            <RouteMap waypoints={VENICE_TOUR} height="100%" />
            <div style={{ position: 'absolute', bottom: '15px', left: '15px', background: 'rgba(0,0,0,0.8)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid var(--border-dark)', zIndex: 500, pointerEvents: 'none' }}>
              📍 Venezia, Italia • <strong>4 tappe reali</strong>
            </div>
          </div>
        </section>

        {/* LOCAL LEGEND / LEADERBOARD INFO SECTION */}
        <section className="r-grid-2" style={{ alignItems: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(255, 176, 0, 0.05) 0%, rgba(22, 24, 34, 0.8) 100%)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '30px', boxShadow: 'var(--shadow)' }}>
            <div style={{ color: 'var(--secondary)', marginBottom: '15px' }}>
              <Trophy size={36} />
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Leaderboard: Diventa &quot;Local Legend&quot; 👑</h3>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', lineHeight: '1.5', marginBottom: '20px' }}>
              Su Strabar, ogni locale o bar reale ha la sua classifica e la sua leggenda locale (proprio come i segmenti di corsa su Strava). Chi registra più sessioni o consuma più U.A. in un determinato locale ne diventa il custode supremo.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>🏆 Cantina Do Mori (Venezia)</span>
                <span style={{ fontSize: '13px', color: 'var(--secondary)' }}>Local Legend: <strong>@il_rossi</strong> (14 visite)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>🏆 The French House (Londra)</span>
                <span style={{ fontSize: '13px', color: 'var(--secondary)' }}>Local Legend: <strong>@london_carl</strong> (8 visite)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>🏆 Bar Albatross (Tokyo)</span>
                <span style={{ fontSize: '13px', color: 'var(--secondary)' }}>Local Legend: <strong>@sake_boss</strong> (11 visite)</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '6px 12px', borderRadius: '30px', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', width: 'fit-content' }}>
              📈 Statistiche & Analisi
            </span>
            <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF' }}>
              Non è alcolismo. È analisi statistica.
            </h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '16px', lineHeight: '1.6' }}>
              Analizziamo ogni sessione generando una heatmap mensile delle tue bevute, proprio come la mappa di calore dei tuoi allenamenti. Tieni traccia dell&apos;andamento del fegato, controlla la gradazione media di ogni bevuta e analizza i tempi spesi a tavola per ottimizzare le tue performance sociali nel tempo.
            </p>
          </div>
        </section>

        {/* FEATURES GRID SECTION */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '40px', fontWeight: '900', color: '#FFF' }}>Le Caratteristiche del Campione 🥇</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '18px', marginTop: '10px' }}>Tutte le funzionalità di cui hai bisogno per tracciare le tue sessioni sociali.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '35px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: 'var(--primary)', background: 'rgba(255, 94, 0, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Beer size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Analizzatore del Carico (U.A.)</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Traccia l&apos;alcol in base alle Unità Alcoliche (U.A.) reali dei singoli drink, calcolate secondo gradazione (ABV) e volume del bicchiere. Monitora lo sforzo e capisci quando fermarti.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: 'var(--secondary)', background: 'rgba(255, 176, 0, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Trophy size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Classifiche Club & Sfide</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Competi nelle classifiche settimanali del club. Guadagna badge digitali esclusivi completando le sfide del mese, proprio come i badge del dislivello su Strava.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px' }}>
              <div style={{ color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '50%', width: 'fit-content' }}>
                <Flame size={28} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Mappe & Ricerca Locali</h3>
              <p style={{ color: 'var(--text-dark-secondary)', lineHeight: '1.6', fontSize: '15px' }}>
                Crea itinerari personalizzati integrati con OpenStreetMap. Cerca bar reali ovunque ti trovi nel mondo, pianifica le tappe e calcola le distanze di camminata tra un cicchetto e l&apos;altro.
              </p>
            </div>
          </div>
        </section>

        {/* CTA CARD */}
        <section className="card landing-cta-pad" style={{ background: 'linear-gradient(135deg, rgba(255, 94, 0, 0.15) 0%, rgba(22, 24, 34, 0.95) 100%)', border: '1px solid var(--border-dark)', padding: '60px 40px', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          <h2 style={{ fontSize: '38px', fontWeight: '900', color: '#FFF', maxWidth: '600px' }}>
            Pronto per il prossimo record personale al tavolo?
          </h2>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '17px', maxWidth: '500px', lineHeight: '1.5' }}>
            Crea il tuo profilo atleta, tagga i tuoi compagni di brindisi e inizia subito ad analizzare le tue sessioni.
          </p>
          <Link href="/auth" className="btn btn-primary" style={{ padding: '16px 36px', borderRadius: '30px', fontSize: '18px', fontWeight: '700', marginTop: '10px' }}>
            Registrati Subito Gratis
          </Link>
        </section>

      </div>
    );
  }

  // Dynamic variables for selected activity modal
  let totalU = 0;
  let derivedBac = 0;
  let barSessions = [];
  let localLegend = { name: "Nessuno", count: 0 };
  let topUnitsLeaderboard = [];
  let topBacLeaderboard = [];
  let bacTimeline = [];

  if (selectedActivity) {
    totalU = parseFloat(selectedActivity.total_units || selectedActivity.drinks?.reduce((acc, d) => acc + ((d.units || 1.5) * d.qty), 0) || 0);
    derivedBac = (selectedActivity.bac_level && parseFloat(selectedActivity.bac_level) > 0)
      ? parseFloat(selectedActivity.bac_level)
      : db.calculateBAC(totalU, selectedActivity.duration || 120);

    if (selectedActivity.location && selectedActivity.location.name) {
      const locNameNormalized = selectedActivity.location.name.trim().toLowerCase();
      barSessions = activities.filter(act => 
        act.location && 
        act.location.name && 
        act.location.name.trim().toLowerCase() === locNameNormalized
      );

      // Calcola Local Legend (visite)
      const userVisits = {};
      barSessions.forEach(s => {
        const uId = s.user_id;
        const name = s.profiles?.display_name || s.profiles?.username || "Atleta Strabar";
        if (!userVisits[uId]) {
          userVisits[uId] = { name, count: 0 };
        }
        userVisits[uId].count += 1;
      });
      
      Object.values(userVisits).forEach(u => {
        if (u.count > localLegend.count) {
          localLegend = u;
        }
      });

      // Top Carico (Max U.A. in una singola sessione)
      topUnitsLeaderboard = [...barSessions]
        .map(s => ({
          name: s.profiles?.display_name || s.profiles?.username || "Atleta Strabar",
          totalUnits: parseFloat(s.total_units || 0)
        }))
        .sort((a, b) => b.totalUnits - a.totalUnits)
        .slice(0, 3);

      // Top BAC (Tasso Alcolico Record in una singola sessione)
      topBacLeaderboard = [...barSessions]
        .map(s => {
          const tU = parseFloat(s.total_units || 0);
          const bac = (s.bac_level && parseFloat(s.bac_level) > 0) ? parseFloat(s.bac_level) : db.calculateBAC(tU, s.duration || 120);
          return {
            name: s.profiles?.display_name || s.profiles?.username || "Atleta Strabar",
            bac
          };
        })
        .sort((a, b) => b.bac - a.bac)
        .slice(0, 3);
    }

    // Timeline BAC
    const peakBac = (totalU * 8) / (70 * 0.68);
    const durMin = selectedActivity.duration || 120;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const fract = i / steps;
      const tMin = Math.round(durMin * fract);
      const hrs = tMin / 60;
      let val = 0;
      if (fract === 0) {
        val = 0;
      } else if (fract <= 0.4) {
        val = (peakBac * (fract / 0.4)) - (0.12 * hrs);
      } else {
        val = peakBac - (0.15 * hrs);
      }
      val = Math.max(0, parseFloat(val.toFixed(2)));
      bacTimeline.push({ tMin, label: `T+${tMin}m`, val });
    }
  }

  return (
    <div className="dashboard-grid">
      {/* Colonna Sinistra: Feed delle Attività */}
      <div className="feed-list">
        {currentUser ? (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', border: '1px solid var(--border-dark)', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div className="activity-avatar" style={{ width: '40px', height: '40px', fontSize: '16px' }}>
                {currentUser.display_name ? currentUser.display_name.charAt(0) : 'U'}
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Pronto per il terzo tempo?</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Traccia la sessione di oggi su Strabar</p>
              </div>
            </div>
            <Link href="/log" className="btn btn-primary" style={{ borderRadius: '20px', padding: '8px 16px', fontSize: '14px' }}>
              <Plus size={16} /> Registra
            </Link>
          </div>
        ) : (
          <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(255, 94, 0, 0.1) 0%, rgba(22, 24, 34, 1) 100%)', border: '1px solid var(--border-dark)', textAlign: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '10px' }}>🍻 Unisciti alla Community di Strabar!</h2>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginBottom: '20px', maxWidth: '500px', margin: '0 auto 20px auto' }}>
              Registra le tue bevute, sfida i tuoi amici in classifica e pianifica i tuoi Bacaro Tour preferiti.
            </p>
            <Link href="/auth" className="btn btn-primary">
              Crea un Account Gratuito
            </Link>
          </div>
        )}

        {activities.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-dark-secondary)' }}>Nessuna attività registrata. Sii il primo a brindare! 🥂</p>
          </div>
        ) : (
          activities.map((act) => {
            const hasCheered = act.cheers?.includes(currentUser?.id);
            return (
              <article key={act.id} className="card activity-card">
                <div className="activity-header">
                  <div className="activity-user-info">
                    <Link href={`/u/${act.user_id}`} className="activity-avatar" style={{ flexShrink: 0 }}>
                      {act.profiles?.display_name ? act.profiles.display_name.charAt(0) : 'U'}
                    </Link>
                    <div>
                      <div className="activity-author">
                        <Link href={`/u/${act.user_id}`} style={{ color: 'inherit' }}>
                          {act.profiles?.display_name || 'Utente Strabar'}
                        </Link>
                        {act.profiles?.is_premium && (
                          <span className="badge-premium" style={{ marginLeft: '8px', fontSize: '8px' }}>
                            Premium
                          </span>
                        )}
                      </div>
                      <div className="activity-meta">{formatDate(act.created_at)}</div>
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>Stato:</span>
                    <strong style={{ color: 'var(--primary)' }}>{act.feeling}</strong>
                  </div>
                </div>

                <h2 className="activity-title" style={{ cursor: 'pointer' }} onClick={() => setSelectedActivity(act)}>{act.title}</h2>
                {act.description && (
                  <p style={{ color: 'var(--text-dark-primary)', fontSize: '15px', marginBottom: '16px', lineHeight: '1.5', cursor: 'pointer' }} onClick={() => setSelectedActivity(act)}>
                    {act.description}
                  </p>
                )}

                <div className="activity-stats">
                  <div className="stat-box">
                    <span className="stat-label">Drink Totali</span>
                    <span className="stat-value highlight">
                      {act.drinks.reduce((acc, d) => acc + d.qty, 0)}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Tempo a Tavola</span>
                    <span className="stat-value">
                      {Math.floor(act.duration / 60)}h {act.duration % 60}m
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Tasso Alcolico Est.</span>
                    <span className="stat-value">
                      {act.total_units} U.A.
                    </span>
                  </div>
                </div>

                {/* Lista Drink taggati */}
                <div className="activity-drinks-detail">
                  {act.drinks.map((drink, idx) => (
                    <span key={idx} className="drink-tag">
                      <Beer size={12} />
                      {drink.qty}x {drink.name} ({drink.abv}%)
                    </span>
                  ))}
                </div>

                 {act.location && (
                   <div style={{ fontSize: '13px', color: 'var(--primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setSelectedActivity(act)}>
                     <span>📍 presso <strong>{act.location.name}</strong></span>
                   </div>
                 )}

                 {act.media && act.media.length > 0 && (
                   <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '4px' }}>
                     {act.media.map((med, idx) => (
                       <span key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                         {med.type === 'video' ? '🎥' : med.type === 'audio' ? '🎵' : '🖼️'} {med.name}
                       </span>
                     ))}
                   </div>
                 )}

                {(() => {
                  const reg = getRegisteredCompanions(act);
                  const regNames = new Set(reg.map((r) => r.name.toLowerCase()));
                  const tagged = (act.drank_with || []).filter((n) => !regNames.has(n.toLowerCase()));
                  if (reg.length === 0 && tagged.length === 0) return null;
                  return (
                    <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span>🍻</span>
                      <strong style={{ color: '#FFF' }}>{act.profiles?.display_name || 'Atleta'}</strong>
                      <span>ha bevuto con</span>
                      {reg.map((c, i) => (
                        <span key={c.user_id}>
                          <Link href={`/u/${c.user_id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>{c.name}</Link>
                          {(i < reg.length - 1 || tagged.length > 0) ? ',' : ''}
                        </span>
                      ))}
                      {tagged.length > 0 && <strong style={{ color: 'var(--text-dark-primary)' }}>{tagged.join(', ')}</strong>}
                    </div>
                  );
                })()}

                {/* Actions (Cheers, Commenta, Condividi) */}
                <div className="activity-actions">
                  <button 
                    onClick={() => handleCheers(act.id)} 
                    className={`action-btn ${hasCheered ? 'active' : ''}`}
                  >
                    <Beer size={18} fill={hasCheered ? 'var(--primary)' : 'none'} />
                    <span>Cheers ({act.cheers?.length || 0})</span>
                  </button>

                  <button onClick={() => toggleCommentsSection(act.id)} className="action-btn">
                    <MessageSquare size={18} />
                    <span>Commenta ({act.comments?.length || 0})</span>
                  </button>

                  <Link href={`/share/${act.id}`} className="action-btn">
                    <Share2 size={18} />
                    <span className="action-btn-label-long">Esporta Social</span>
                    <span className="action-btn-label-short" style={{ display: 'none' }}>Esporta</span>
                  </Link>
                </div>

                {/* Comments Section */}
                {activeCommentsSection[act.id] && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-dark)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
                      {act.comments && act.comments.map((comment) => (
                        <div key={comment.id} style={{ display: 'flex', gap: '10px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
                          <div className="activity-avatar" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                            {comment.user_name ? comment.user_name.charAt(0) : 'U'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                              <strong>{comment.user_name}</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-dark-primary)' }}>{comment.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {currentUser ? (
                      <form onSubmit={(e) => handleCommentSubmit(e, act.id)} style={{ display: 'flex', gap: '10px' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Scrivi un commento di incoraggiamento..."
                          value={newCommentText[act.id] || ''}
                          onChange={(e) => handleCommentChange(act.id, e.target.value)}
                          style={{ height: '40px', padding: '10px 15px', borderRadius: '20px', fontSize: '14px' }}
                          required
                        />
                        <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '20px', fontSize: '14px' }}>
                          Invia
                        </button>
                      </form>
                    ) : (
                      <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center' }}>
                        <Link href="/auth" style={{ color: 'var(--primary)', fontWeight: '600' }}>Accedi</Link> per commentare questa attività.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Colonna Destra: Sidebar Statistiche e Leaderboard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Widget Profilo Rapido */}
        {currentUser && (
          <div className="card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--primary)" />
              Attività Recente
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Sessioni (7gg)</span>
                <strong style={{ fontSize: '16px' }}>{weeklyStreak}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Drink Totali</span>
                <strong style={{ fontSize: '16px' }}>{totalDrinksCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Stato Premium</span>
                <strong>
                  {currentUser.is_premium ? (
                    <span style={{ color: 'var(--secondary)', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Award size={14} /> Attivo
                    </span>
                  ) : (
                    <Link href="/premium" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '14px' }}>
                      Attiva
                    </Link>
                  )}
                </strong>
              </div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <Link href="/profile" className="btn btn-secondary" style={{ width: '100%', borderRadius: '20px', padding: '8px 0', fontSize: '13px' }}>
                <Calendar size={14} /> Vedi Calendario
              </Link>
            </div>
          </div>
        )}

        {/* Widget Leaderboard (Segmenti di Strava) */}
        <div className="card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={18} color="var(--secondary)" />
            Leaderboard Club 🏆
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '15px' }}>
            Classifica settimanale basata sulle Unità Alcoliche (U.A.) registrate.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leaderboardData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: item.name === currentUser?.display_name ? 'rgba(255, 94, 0, 0.08)' : 'rgba(255,255,255,0.01)', borderRadius: '8px', border: item.name === currentUser?.display_name ? '1px dashed var(--primary)' : '1px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '800', width: '20px', color: idx === 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)' }}>
                    #{idx + 1}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>
                    {item.name}
                    {item.isPremium && (
                      <span className="badge-premium" style={{ fontSize: '7px', padding: '1px 4px', marginLeft: '5px' }}>
                        P
                      </span>
                    )}
                  </span>
                </div>
                <strong style={{ fontSize: '14px', color: idx === 0 ? 'var(--secondary)' : 'inherit' }}>
                  {item.units} U.A.
                </strong>
              </div>
            ))}
          </div>
        </div>

        {/* Challenge Promozionale */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(255, 176, 0, 0.1) 0%, rgba(22, 24, 34, 1) 100%)', border: '1px solid var(--border-dark)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={18} color="var(--primary)" />
            Sfida del Mese
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', lineHeight: '1.4', marginBottom: '15px' }}>
            <strong>Strabar Giro d&apos;Italia:</strong> Completa almeno 3 Bacaro Tour differenti nel mese di Giugno e sblocca il badge digitale esclusivo &quot;Gomito di Bronzo&quot;.
          </p>
          <Link href="/routes" className="btn btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '8px 0', fontSize: '13px' }}>
            Trova Percorsi
          </Link>
        </div>
      </div>

      {/* MODAL DETTAGLI ATTIVITA (STRAVA WORKOUT STYLE) */}
      {selectedActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedActivity(null)}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0A09', border: '2px solid var(--primary)', boxShadow: '0px 0px 30px rgba(255, 94, 0, 0.25)', animation: 'slideUp 0.3s ease', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="activity-avatar" style={{ width: '45px', height: '45px', fontSize: '18px', border: '2px solid var(--primary)' }}>
                  {selectedActivity.profiles?.display_name ? selectedActivity.profiles.display_name.charAt(0) : 'U'}
                </div>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>{selectedActivity.profiles?.display_name || 'Atleta Strabar'}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{formatDate(selectedActivity.created_at)}</span>
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '32px', height: '32px' }} onClick={() => setSelectedActivity(null)}>×</button>
            </div>

            {/* Titolo e Descrizione */}
            <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>{selectedActivity.title}</h2>
            {selectedActivity.description && (
              <p style={{ color: 'var(--text-dark-primary)', fontSize: '16px', lineHeight: '1.6', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                {selectedActivity.description}
              </p>
            )}

            {/* Performance Stats (Griglia Strava-style) */}
            <div className="r-grid-stat-4" style={{ marginBottom: '25px', background: 'rgba(255, 94, 0, 0.04)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255, 94, 0, 0.15)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Drink Totali</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', marginTop: '5px' }}>
                  {selectedActivity.drinks.reduce((acc, d) => acc + d.qty, 0)}
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Tempo Sforzo</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginTop: '8px' }}>
                  {Math.floor(selectedActivity.duration / 60)}h {selectedActivity.duration % 60}m
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Carico Alcolico</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--secondary)', marginTop: '5px' }}>
                  {totalU.toFixed(1)} <span style={{ fontSize: '12px', fontWeight: '600' }}>U.A.</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>BAC Stimato</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: derivedBac > 0.5 ? 'var(--error)' : 'var(--success)', marginTop: '5px' }}>
                  {derivedBac.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '600' }}>g/l</span>
                </div>
              </div>
            </div>

            {/* TIMELINE CURVA BAC */}
            <div style={{ marginBottom: '25px', background: 'rgba(255, 94, 0, 0.02)', border: '1px solid var(--border-dark)', padding: '16px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '15px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📈 Curva d&apos;Ebbrezza (Assorbimento & Smaltimento Widmark)
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', padding: '10px 0' }}>
                <div style={{ position: 'absolute', top: '24px', left: '20px', right: '20px', height: '3px', background: 'linear-gradient(90deg, var(--success) 0%, var(--primary) 50%, var(--error) 100%)', zIndex: 1 }} />
                
                {bacTimeline.map((pt, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '600' }}>{pt.label}</span>
                    <div style={{ 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      background: pt.val > 0.8 ? 'var(--error)' : pt.val > 0.5 ? 'var(--primary)' : 'var(--success)', 
                      border: '3px solid #000',
                      boxShadow: '0 0 10px rgba(255,94,0,0.5)',
                      marginTop: '6px',
                      marginBottom: '6px'
                    }} />
                    <span style={{ fontSize: '12px', fontWeight: '800', color: pt.val > 0.5 ? 'var(--primary)' : '#FFF' }}>
                      {pt.val.toFixed(2)} <span style={{ fontSize: '9px', fontWeight: 'normal', color: 'var(--text-dark-secondary)' }}>g/l</span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dark-secondary)', marginTop: '8px' }}>
                <span>Inizio (Sobrio)</span>
                <span>Fase di Salita</span>
                <span>Fine Sforzo (Smaltimento fegato)</span>
              </div>
            </div>

            {/* SEZIONE MAPPA / INTEGRAZIONE LOCALE */}
            {selectedActivity.location && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Sede del Brindisi (Integrazione Mappe)
                </h3>
                <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong style={{ color: '#FFF', fontSize: '15px' }}>{selectedActivity.location.name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{selectedActivity.location.address}</div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedActivity.location.name + ' ' + selectedActivity.location.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
                    >
                      Apri in Google Maps
                    </a>
                  </div>
                  
                  {/* Iframe di anteprima statica di OpenStreetMap */}
                  <div style={{ height: '180px', width: '100%', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-dark)', position: 'relative' }}>
                    <iframe
                      title="Mappa Locale"
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      marginHeight="0"
                      marginWidth="0"
                      src={`https://maps.google.com/maps?q=${selectedActivity.location.lat},${selectedActivity.location.lng}&z=16&output=embed&iwloc=near`}
                      style={{ filter: 'invert(90%) hue-rotate(180deg) grayscale(30%)' }}
                    ></iframe>
                  </div>

                  {/* Classifiche Segmento Bar */}
                  <div style={{ marginTop: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '15px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏆 Classifiche Segmento Bar (Top Atleti)
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      {/* Top Carico Alcolico */}
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dark)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                          🏋️‍♂️ Record Carico (Max U.A.)
                        </div>
                        {topUnitsLeaderboard.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Nessun record</div>
                        ) : (
                          topUnitsLeaderboard.map((item, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: index < topUnitsLeaderboard.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                              <span style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '120px' }}>#{index+1} {item.name}</span>
                              <strong style={{ color: 'var(--secondary)' }}>{item.totalUnits.toFixed(1)} U.A.</strong>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {/* Top BAC */}
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-dark)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                          ⚡ Record BAC (Picco g/l)
                        </div>
                        {topBacLeaderboard.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Nessun record</div>
                        ) : (
                          topBacLeaderboard.map((item, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: index < topBacLeaderboard.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                              <span style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '120px' }}>#{index+1} {item.name}</span>
                              <strong style={{ color: 'var(--error)' }}>{item.bac.toFixed(2)} g/l</strong>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,176,0,0.04)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,176,0,0.1)', marginTop: '12px', fontSize: '12px' }}>
                      <span>👑</span>
                      <div>
                        <strong>Local Legend di questo bar:</strong> {localLegend.name} ({localLegend.count} {localLegend.count === 1 ? 'allenamento' : 'allenamenti'} registrati qui).
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEZIONE ALLEGATI MULTIMEDIALI (FOTO / AUDIO / VIDEO) */}
            {selectedActivity.media && selectedActivity.media.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px' }}>
                  🖼️ Media e Ricordi della Serata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                  {selectedActivity.media.map((med, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px', padding: '10px', textAlign: 'center', position: 'relative', overflow: 'hidden', height: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      {med.type === 'image' && (
                        <div style={{ width: '100%', height: '100%', backgroundSize: 'cover', backgroundImage: `url(${med.url})`, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                      )}
                      
                      <div style={{ zIndex: 1, color: med.type === 'image' ? '#FFF' : 'var(--primary)', background: med.type === 'image' ? 'rgba(0,0,0,0.6)' : 'none', padding: med.type === 'image' ? '6px' : '0', borderRadius: med.type === 'image' ? '50%' : '0' }}>
                        {med.type === 'video' ? <Video size={32} /> : med.type === 'audio' ? <Volume2 size={32} /> : <Camera size={20} />}
                      </div>
                      
                      <span style={{ zIndex: 1, fontSize: '11px', fontWeight: '600', color: '#FFF', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', maxWidth: '90%', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        {med.name || (med.type.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Elenco completo e dettagliato delle consumazioni */}
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Dettagli della Prestazione (Drinks)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px' }}>
              {selectedActivity.drinks.map((drink, idx) => {
                const calculatedUnits = (drink.units ? (drink.units * drink.qty) : (drink.qty * 1.5));
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Beer size={18} color="var(--primary)" />
                      <div>
                        <strong style={{ fontSize: '15px' }}>{drink.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Gradazione: {drink.abv}%</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>{drink.qty} bicchieri</div>
                      <div style={{ fontSize: '11px', color: 'var(--primary)' }}>~ {calculatedUnits.toFixed(1)} Unità</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Social details (Compagnia e Cheers) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px', borderTop: '1px solid var(--border-dark)', paddingTop: '20px', fontSize: '14px' }}>
              {selectedActivity.drank_with && selectedActivity.drank_with.length > 0 ? (
                <div style={{ color: 'var(--text-dark-secondary)' }}>
                  👥 Compagni di allenamento: <strong style={{ color: '#FFF' }}>{selectedActivity.drank_with.join(', ')}</strong>
                </div>
              ) : (
                <div style={{ color: 'var(--text-dark-secondary)' }}>🏃 Allenamento Solitario</div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ color: 'var(--text-dark-secondary)' }}>
                  🔥 Livello Sforzo: <strong style={{ color: 'var(--primary)' }}>{selectedActivity.feeling}</strong>
                </span>
                <Link href={`/share/${selectedActivity.id}`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setSelectedActivity(null)}>
                  <Share2 size={14} /> Esporta
                </Link>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
