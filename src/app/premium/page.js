'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Award, Check, ShieldCheck, Map, BarChart3, Flame, Smile, AlertCircle } from 'lucide-react';

export default function PremiumPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await db.getCurrentUser();
      setUser(currentUser);
    };
    checkUser();
  }, []);

  const handleUpgrade = async () => {
    if (!user) {
      router.push('/auth');
      return;
    }

    setLoading(true);
    try {
      // Simula una chiamata di rete
      await new Promise(resolve => setTimeout(resolve, 2000));
      await db.upgradeToPremium();
      setSuccess(true);
      
      // Notifica navbar del cambiamento
      window.dispatchEvent(new Event('auth-change'));
      
      // Aggiorna stato locale
      const updatedUser = await db.getCurrentUser();
      setUser(updatedUser);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '50px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <span className="badge-premium" style={{ fontSize: '14px', padding: '6px 14px', marginBottom: '15px' }}>
          Strabar Summit 🏔️
        </span>
        <h1 style={{ fontSize: '42px', fontWeight: '800', marginBottom: '15px', background: 'var(--premium-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Sblocca il bevitore che c&apos;è in te
        </h1>
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: '18px', maxWidth: '600px', margin: '0 auto' }}>
          Tutte le funzioni avanzate di pianificazione, analisi e tracciamento sono <strong style={{ color: 'var(--secondary)' }}>gratuite per tutti durante la beta</strong>. Nessun pagamento richiesto.
        </p>
      </div>

      {success && (
        <div className="card" style={{ border: '2px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)', textAlign: 'center', padding: '30px', marginBottom: '30px' }}>
          <ShieldCheck size={50} color="var(--success)" style={{ margin: '0 auto 15px auto' }} />
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#FFF', marginBottom: '10px' }}>Funzioni avanzate attive! 🍻</h2>
          <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
            Ora hai accesso completo a tutte le mappe di pianificazione dei percorsi e ai grafici avanzati — gratis durante la beta.
          </p>
          <button onClick={() => router.push('/routes')} className="btn btn-primary">
            Vai a Pianificare Percorsi
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', alignItems: 'stretch' }}>
        {/* Colonna Sinistra: Benefici */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(255, 32, 0, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--primary)' }}>
              <Map size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Pianificatore Itinerari Pub Crawl Illimitato 🗺️</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                Disegna itinerari pub crawl personalizzati sulle mappe Leaflet. Salva le tappe nei bar o nelle tue zone preferite.
              </p>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(223, 255, 0, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--secondary)' }}>
              <BarChart3 size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Curva Alcolica BAC & Analytics 📈</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                Accedi al grafico simulato dell&apos;assorbimento dell&apos;alcol nel sangue (formula di Widmark) per capire il picco di ebrezza e stimare l&apos;ora di ritorno alla sobrietà.
              </p>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', gap: '15px', padding: '20px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '12px', height: 'fit-content', color: 'var(--success)' }}>
              <Flame size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Filtro Leaderboard & Classifiche Bar 🔥</h4>
              <p style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', lineHeight: '1.4' }}>
                Filtra la classifica per età, peso e scopri chi detiene il primato di consumo di Spritz o birre in specifici bar registrati come &quot;Locali&quot;.
              </p>
            </div>
          </div>
        </div>

        {/* Colonna Destra: Cassa / Pricing */}
        <div className="card" style={{ border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '35px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: '800' }}>Strabar Summit</h3>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontWeight: '700', fontSize: '12px', padding: '4px 10px', borderRadius: '12px' }}>
                Beta gratuita 🎉
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '30px' }}>
              <span style={{ fontSize: '46px', fontWeight: '900' }}>Gratis</span>
              <span style={{ color: 'var(--text-dark-secondary)' }}>/ per tutti, durante la beta</span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> Pianificazione percorsi interattiva
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> Statistiche avanzate curva BAC
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> Badge Premium sul profilo
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                <Check size={16} color="var(--primary)" /> Nessuna pubblicità nel feed
              </li>
            </ul>
          </div>

          <div>
            {user?.is_premium ? (
              <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(223, 255, 0, 0.1)', color: 'var(--secondary)', fontWeight: '700', borderRadius: '20px', border: '1px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span>Tutte le funzioni sbloccate! ⭐</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-dark-secondary)' }}>
                  Gratis per tutti durante la beta
                </span>
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                className="btn btn-premium"
                style={{ width: '100%', padding: '16px', borderRadius: '30px', fontSize: '16px' }}
                disabled={loading || success}
              >
                {loading ? 'Attivazione in corso...' : 'Sblocca tutto (gratis)'}
              </button>
            )}

            <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '12px', lineHeight: '1.4' }}>
              Durante la beta tutte le funzioni sono gratuite per tutti. Nessun pagamento richiesto.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
