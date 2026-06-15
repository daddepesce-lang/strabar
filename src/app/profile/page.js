'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Calendar, User, Beer, Award, Heart, Shield, Clock, TrendingUp, Info } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayDetails, setSelectedDayDetails] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) {
          router.push('/auth');
          return;
        }
        setCurrentUser(user);
        
        const acts = await db.getActivities();
        // Filtra le attività dell'utente corrente
        const userActs = acts.filter(a => a.user_id === user.id);
        setActivities(userActs);
      } catch (err) {
        console.error("Errore nel caricamento del profilo:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [router]);

  // Calcola statistiche storiche
  const totalDrinksCount = activities.reduce((acc, act) => {
    return acc + act.drinks.reduce((dAcc, d) => dAcc + d.qty, 0);
  }, 0);

  const totalUnits = activities.reduce((acc, act) => acc + act.total_units, 0);

  const totalMinutes = activities.reduce((acc, act) => acc + act.duration, 0);

  // Calcola il drink preferito
  const drinkCounts = {};
  activities.forEach(act => {
    act.drinks.forEach(d => {
      drinkCounts[d.name] = (drinkCounts[d.name] || 0) + d.qty;
    });
  });
  let favoriteDrink = 'Nessuno';
  let maxQty = 0;
  Object.entries(drinkCounts).forEach(([name, qty]) => {
    if (qty > maxQty) {
      maxQty = qty;
      favoriteDrink = name;
    }
  });

  // Genera dati per il calendario delle bevute (Mese Corrente, ad esempio Giugno 2026)
  // Per semplicità facciamo una griglia di 30 giorni
  const daysInMonth = 30;
  const monthName = 'Giugno 2026';
  
  // Mappa le attività sui giorni del mese basandosi sulla data di creazione
  const getDayAlcolLevel = (dayNum) => {
    // Cerca attività in quel giorno specifico (es. 2026-06-XX)
    const dayActs = activities.filter(act => {
      const actDate = new Date(act.created_at);
      // Assumiamo che stiamo tracciando per il mese corrente
      return actDate.getDate() === dayNum && actDate.getMonth() === 5; // 5 = Giugno (0-indexed)
    });

    const dayUnits = dayActs.reduce((acc, a) => acc + a.total_units, 0);
    
    let levelClass = '';
    if (dayUnits > 0 && dayUnits <= 2) levelClass = 'drink-level-1';
    else if (dayUnits > 2 && dayUnits <= 4) levelClass = 'drink-level-2';
    else if (dayUnits > 4 && dayUnits <= 6) levelClass = 'drink-level-3';
    else if (dayUnits > 6) levelClass = 'drink-level-4';

    return {
      units: dayUnits,
      levelClass,
      activities: dayActs
    };
  };

  const handleDayClick = (dayNum, dayInfo) => {
    if (dayInfo.units > 0) {
      setSelectedDayDetails({
        day: dayNum,
        ...dayInfo
      });
    } else {
      setSelectedDayDetails(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Stiamo caricando la tua scheda atleti... 🍺
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Intestazione Profilo */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', border: '1px solid var(--border-dark)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,94,0,0.05) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="activity-avatar" style={{ width: '80px', height: '80px', fontSize: '32px', border: '3px solid var(--primary)' }}>
            {currentUser?.display_name ? currentUser.display_name.charAt(0) : 'U'}
          </div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {currentUser?.display_name}
              {currentUser?.is_premium && (
                <span className="badge-premium">
                  <Award size={14} /> Premium
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px' }}>
              @{currentUser?.username} • Iscritto a Strabar da {new Date(currentUser?.created_at).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div>
          {!currentUser?.is_premium ? (
            <Link href="/premium" className="btn btn-premium">
              Passa a Strabar Premium
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)', fontWeight: '700', fontSize: '14px', background: 'rgba(255, 176, 0, 0.1)', padding: '10px 16px', borderRadius: '30px', border: '1px solid var(--secondary)' }}>
              <Shield size={16} /> Membro Summit Attivo
            </div>
          )}
        </div>
      </div>

      {/* Grid delle Statistiche (Performance Dashboard) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary)', marginBottom: '10px' }}>
            <Beer size={32} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Drink Totali</span>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>{totalDrinksCount}</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--secondary)', marginBottom: '10px' }}>
            <TrendingUp size={32} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Unità Alcoliche (U.A.)</span>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>{totalUnits.toFixed(1)}</div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#10B981', marginBottom: '10px' }}>
            <Clock size={32} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Tempo Al Tavolo</span>
          <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '5px' }}>
            {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
          </div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#3B82F6', marginBottom: '10px' }}>
            <Heart size={32} />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Drink Preferito</span>
          <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '15px', color: 'var(--primary)', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {favoriteDrink}
          </div>
        </div>
      </div>

      {/* Sezione Centrale: Calendario Heatmap e Attività */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
        
        {/* Calendario delle Bevute (Heatmap) */}
        <div className="card">
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={20} color="var(--primary)" />
            Calendario delle Bevute (Heatmap)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
            Visualizza l&apos;intensità dei tuoi allenamenti alcolici. Più il colore è scuro, più intensa è stata la serata. Clicca sui giorni colorati per i dettagli.
          </p>

          <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', padding: '20px', borderRadius: 'var(--radius)' }}>
            <h4 style={{ textAlign: 'center', marginBottom: '15px', fontWeight: '700', color: '#FFF' }}>{monthName}</h4>
            
            <div className="calendar-grid">
              {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
                <div key={day} className="calendar-day-header">{day}</div>
              ))}
              
              {/* Genera offset per il 1° Giugno 2026 (che è Lunedì, quindi nessun offset!) */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dayInfo = getDayAlcolLevel(dayNum);
                return (
                  <div
                    key={dayNum}
                    onClick={() => handleDayClick(dayNum, dayInfo)}
                    className={`calendar-day ${dayInfo.levelClass}`}
                    title={`${dayNum} Giugno: ${dayInfo.units.toFixed(1)} U.A.`}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>

            {/* Legenda Calore */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '20px', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
              <span>Meno alcol</span>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255, 176, 0, 0.2)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255, 94, 0, 0.4)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255, 94, 0, 0.7)' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#E04D00' }}></div>
              <span>Più alcol</span>
            </div>
          </div>
        </div>

        {/* Dettagli Giorno Selezionato */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={18} color="var(--secondary)" />
            Dettaglio Giorno
          </h3>

          {selectedDayDetails ? (
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)', marginBottom: '12px' }}>
                {selectedDayDetails.day} {monthName}
              </h4>
              <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>U.A. Consumate</div>
                <div style={{ fontSize: '28px', fontWeight: '800' }}>{selectedDayDetails.units.toFixed(1)}</div>
              </div>

              <strong style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Attività del giorno:</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedDayDetails.activities.map((act) => (
                  <div key={act.id} style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '12px', paddingY: '4px' }}>
                    <div style={{ fontWeight: '700', fontSize: '14px' }}>{act.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
                      {act.drinks.map(d => `${d.qty}x ${d.name}`).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
              Clicca su un giorno evidenziato nel calendario per vederne i dettagli e le bevute associate.
            </div>
          )}
        </div>
      </div>

      {/* SEZIONE STATISTICHE AVANZATE SUMMIT (CURVA BAC & LEADERBOARD SEGMENTI BAR) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '30px', marginTop: '10px' }}>
        
        {/* Curva Alcolica BAC Settimanale */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📈 Curva di Ebbrezza BAC Settimanale (Simulata Widmark)
            {(!currentUser?.is_premium) && (
              <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
            )}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
            Monitora l&apos;assorbimento dell&apos;alcol nel sangue (g/l) nelle ultime 7 giornate per comprendere i tuoi picchi di carico.
          </p>

          {currentUser?.is_premium ? (
            <div style={{ padding: '20px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
              {/* Grafico simulato con barre CSS ad altezza variabile */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', height: '180px', paddingTop: '20px', position: 'relative' }}>
                
                {/* Linea limite tasso alcolico guida 0.5 g/l */}
                <div style={{ position: 'absolute', top: '100px', left: 0, right: 0, height: '1px', borderTop: '1px dashed var(--error)', zIndex: 1 }} />
                <span style={{ position: 'absolute', top: '82px', right: '5px', fontSize: '9px', color: 'var(--error)', fontWeight: '700', zIndex: 2 }}>Limite Guida (0.5 g/l)</span>

                {[
                  { day: 'Lun', val: 0.12, h: '25%' },
                  { day: 'Mar', val: 0.00, h: '4%' },
                  { day: 'Mer', val: 0.45, h: '65%' },
                  { day: 'Gio', val: 0.20, h: '35%' },
                  { day: 'Ven', val: 0.84, h: '120px' },
                  { day: 'Sab', val: 1.15, h: '160px' },
                  { day: 'Dom', val: 0.35, h: '50%' }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px', zIndex: 2 }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: item.val > 0.5 ? 'var(--error)' : 'var(--success)' }}>{item.val.toFixed(2)}</span>
                    <div style={{ width: '22px', height: item.h, background: item.val > 0.5 ? 'var(--premium-gradient)' : 'var(--success)', borderRadius: '4px', transition: 'height 0.5s ease' }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{item.day}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', border: '1px dashed var(--border-dark)', minHeight: '220px' }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>Contenuto Protetto da Strabar Summit 🏔️</div>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', maxWidth: '350px', marginBottom: '20px' }}>
                L&apos;analisi scientifica avanzata del tasso alcolico nel sangue (BAC) e lo storico grafico settimanale è riservata ai membri Summit.
              </p>
              <Link href="/premium" className="btn btn-premium" style={{ padding: '8px 18px', fontSize: '13px' }}>
                Abbonati a Premium (€4.99)
              </Link>
            </div>
          )}
        </div>

        {/* Classifiche Segmenti Bar */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🏆 I tuoi Segmenti (Classifica Bar)
            {(!currentUser?.is_premium) && (
              <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
            )}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
            Vedi il tuo posizionamento storico nei locali reali in cui hai gareggiato.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#FFF' }}>Cantina Do Mori (VE)</strong>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>Segmento: Ombra di Rosso</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--secondary)' }}>Posizione: #4</span>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>su 148 atleti</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#FFF' }}>Osteria Al Mercà (VE)</strong>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>Segmento: Spritz Select Sprint</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--secondary)' }}>Posizione: #22</span>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>su 340 atleti</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
