'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { Calendar, User, Beer, Award, Heart, Clock, TrendingUp, Info, Search, UserPlus, UserMinus, Users, MapPin } from 'lucide-react';
import ShareAppButton from '@/components/ShareAppButton';
import Avatar from '@/components/Avatar';
import BacInfo from '@/components/BacInfo';
import FollowsModal from '@/components/FollowsModal';

const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

export default function ProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayDetails, setSelectedDayDetails] = useState(null);

  // Stati per la scheda Social / Amici
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' o 'friends'
  const [friendsSearchQuery, setFriendsSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [followingList, setFollowingList] = useState([]); // tenuto per compat (handleFollowToggle)
  const [followersList, setFollowersList] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followsModal, setFollowsModal] = useState(null); // 'followers' | 'following' | null
  const [isSearchingFriends, setIsSearchingFriends] = useState(false);

  const [barRankings, setBarRankings] = useState([]);

  // Peso corporeo (per BAC e curva d'ebbrezza precisi)
  const [weightInput, setWeightInput] = useState('');
  const [savingSex, setSavingSex] = useState(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);

  // Orario corrente: aggiornato ogni minuto per tenere "vivo" il tasso alcolico attuale.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const handleSaveSex = async (sex) => {
    setSavingSex(true);
    try {
      await db.updateProfile(currentUser.id, { sex });
      setCurrentUser((prev) => ({ ...prev, sex }));
    } catch (err) {
      console.error('Errore salvataggio sesso:', err);
    } finally {
      setSavingSex(false);
    }
  };

  const handleSaveWeight = async () => {
    const w = parseInt(weightInput, 10);
    if (!w || w < 30 || w > 250) {
      alert('Inserisci un peso valido (tra 30 e 250 kg).');
      return;
    }
    setSavingWeight(true);
    try {
      await db.updateProfile(currentUser.id, { weight: w });
      setCurrentUser((prev) => ({ ...prev, weight: w }));
      setWeightSaved(true);
      setTimeout(() => setWeightSaved(false), 2000);
    } catch (err) {
      alert('Errore nel salvataggio del peso: ' + (err.message || err));
    } finally {
      setSavingWeight(false);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await db.getCurrentUser();
        if (!user) {
          router.push('/auth');
          return;
        }
        setCurrentUser(user);
        setWeightInput(user.weight ? String(user.weight) : '');
        // Apri direttamente la scheda "Amici" se richiesto dalla lente in navbar (?tab=friends)
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'friends') {
          setActiveTab('friends');
        }

        // Solo le sessioni dell'utente (query mirata su user_id, senza scaricare
        // tutta la tabella né i `media` base64): molto più veloce.
        const userActs = typeof db.getUserActivities === 'function'
          ? await db.getUserActivities(user.id)
          : (await db.getActivities()).filter(a => a.user_id === user.id);
        setActivities(userActs);
      } catch (err) {
        console.error("Errore nel caricamento del profilo:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [router]);

  const loadSocialData = async (userId) => {
    try {
      // EGRESS: solo i CONTEGGI follower/seguiti (le liste si aprono on-demand nel modale)
      // e i suggerimenti (versione leggera). Niente più caricamento delle liste intere.
      if (typeof db.getFollowCounts === 'function') {
        setFollowCounts(await db.getFollowCounts(userId));
      }
      if (typeof db.getSuggestedProfiles === 'function') {
        setSuggestions(await db.getSuggestedProfiles(userId));
      }
    } catch (err) {
      console.error("Errore nel caricamento dei dati social:", err);
    }
  };

  const handleFollowToggle = async (targetUser) => {
    const isCurrentlyFollowing = followingList.some(f => f.id === targetUser.id);
    try {
      if (isCurrentlyFollowing) {
        await db.unfollowUser(targetUser.id);
      } else {
        await db.followUser(targetUser.id);
      }
      if (currentUser) {
        await loadSocialData(currentUser.id);
      }
    } catch (err) {
      alert(err.message || "Errore");
    }
  };

  const handleSearchFriends = async (queryText) => {
    setFriendsSearchQuery(queryText);
    if (!queryText.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearchingFriends(true);
    try {
      const results = await db.searchProfiles(queryText);
      const filteredResults = results.filter(u => u.id !== currentUser?.id);
      setSearchResults(filteredResults);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingFriends(false);
    }
  };

  useEffect(() => {
    if (currentUser && activeTab === 'friends') {
      loadSocialData(currentUser.id);
      setSearchResults([]);
    }
  }, [currentUser, activeTab]);

  // Classifiche bar REALI: per ogni locale verificato in cui ho bevuto, calcola la mia posizione
  useEffect(() => {
    if (!currentUser || activities.length === 0) { setBarRankings([]); return; }
    let cancelled = false;
    (async () => {
      const keys = [...new Set(
        activities
          .filter((a) => a.location?.name && !a.location?.unverified)
          .map((a) => ({ key: db.normalizePlaceKey(a.location.name), name: a.location.name }))
          .map((o) => JSON.stringify(o))
      )].map((s) => JSON.parse(s));

      const results = [];
      for (const { key, name } of keys) {
        try {
          const lb = await db.getPlaceLeaderboard(key);
          const sorted = [...lb].sort((a, b) => b.units - a.units || b.visits - a.visits);
          const idx = sorted.findIndex((u) => u.user_id === currentUser.id);
          if (idx >= 0) {
            results.push({ name, rank: idx + 1, total: sorted.length, units: sorted[idx].units, visits: sorted[idx].visits });
          }
        } catch { /* noop */ }
      }
      results.sort((a, b) => a.rank - b.rank);
      if (!cancelled) setBarRankings(results.slice(0, 6));
    })();
    return () => { cancelled = true; };
  }, [currentUser, activities]);

  // Calcola statistiche storiche
  const totalDrinksCount = activities.reduce((acc, act) => {
    return acc + act.drinks.reduce((dAcc, d) => dAcc + d.qty, 0);
  }, 0);

  const totalUnits = activities.reduce((acc, act) => acc + act.total_units, 0);

  const totalMinutes = activities.reduce((acc, act) => acc + act.duration, 0);

  // Tasso alcolico ATTUALE (adesso): include la sessione live in corso (se c'è)
  // e il residuo da sessioni chiuse nelle ultime ore. 0 = sobrio.
  const currentBAC = (() => {
    if (!currentUser || activities.length === 0) return 0;
    const nowISO = new Date(now).toISOString();
    const weight = currentUser.weight;
    const sex = currentUser.sex;
    const w = parseFloat(weight) > 0 ? parseFloat(weight) : 70;
    const r = db._widmarkR(sex);
    const active = activities.find(
      (a) => a.is_active && now - new Date(a.created_at).getTime() < 5 * 60 * 60 * 1000
    );
    if (active) {
      const duration = Math.max(1, Math.round((now - new Date(active.created_at).getTime()) / 60000));
      // Residuo CONGELATO sulla sessione (riferito al suo avvio): stesso valore del
      // pannello live → niente più doppio smaltimento (era il bug live-vs-profilo).
      const residual = db.sessionResidualGrams(active, activities, weight, sex);
      return db.calculateCurrentBAC(active.drinks || [], active.created_at, duration, nowISO, weight, active.full_stomach, sex, residual);
    }
    // Nessuna sessione live: solo residuo da sessioni chiuse, valutato adesso.
    const residual = db.residualGramsAtTime(activities, nowISO, weight, sex);
    return parseFloat((residual / (w * r)).toFixed(2));
  })();
  const hasActiveLive = activities.some(
    (a) => a.is_active && now - new Date(a.created_at).getTime() < 5 * 60 * 60 * 1000
  );

  // Luoghi del bere dell'utente (per la mappa del profilo)
  const drinkPlaces = (() => {
    const map = {};
    activities.forEach((a) => {
      const loc = a.location;
      if (!loc?.name || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
      const key = loc.name.trim().toLowerCase();
      if (!map[key]) map[key] = { name: loc.name, lat: loc.lat, lng: loc.lng, visits: 0, units: 0 };
      map[key].visits += 1;
      map[key].units += parseFloat(a.total_units || 0);
    });
    return Object.values(map).map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      label: p.visits,
      note: `${p.visits} ${p.visits === 1 ? 'visita' : 'visite'} · ${p.units.toFixed(1)} U.A.`,
    }));
  })();

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

  // Genera dati per il calendario delle bevute (mese corrente, dinamico)
  const calNow = new Date();
  const calYear = calNow.getFullYear();
  const calMonth = calNow.getMonth(); // 0-indexed
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthName = calNow.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  // Mappa le attività sui giorni del mese corrente basandosi sulla data di creazione
  const getDayAlcolLevel = (dayNum) => {
    const dayActs = activities.filter(act => {
      const actDate = new Date(act.created_at);
      return actDate.getDate() === dayNum && actDate.getMonth() === calMonth && actDate.getFullYear() === calYear;
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
      <div className="card profile-header" style={{ position: 'relative', textAlign: 'center', border: '1px solid var(--border-dark)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.05) 100%)' }}>
        {/* Azioni in alto a destra */}
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('friends')}
            title="Cerca atleti"
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Search size={18} />
          </button>
          <Link
            href="/settings"
            title="Impostazioni profilo"
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}
          >
            ⚙️
          </Link>
        </div>

        {/* Avatar + nome centrati */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Avatar src={currentUser?.avatar_url} name={currentUser?.display_name || currentUser?.username} size={84} style={{ border: '3px solid var(--primary)' }} />
          <h1 style={{ fontSize: '26px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', margin: 0 }}>
            {currentUser?.display_name}
            {currentUser?.is_premium && (
              <span className="badge-premium"><Award size={14} /> Premium</span>
            )}
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', margin: 0 }}>
            @{currentUser?.username} • dal {new Date(currentUser?.created_at).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tasso alcolico ATTUALE (adesso) */}
      {(() => {
        const overLimit = currentBAC >= 0.5;        // limite legale alla guida in Italia
        const hasAlcohol = currentBAC > 0;
        const color = overLimit ? 'var(--error)' : hasAlcohol ? 'var(--primary)' : 'var(--success)';
        const msg = overLimit
          ? '🚫 Sopra il limite legale alla guida (0,5 g/l). Non metterti al volante.'
          : hasAlcohol
          ? '⚠️ Hai ancora alcol in circolo. Aspetta prima di guidare.'
          : '✅ Sei sobrio: nessun alcol stimato in circolo adesso.';
        return (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', border: `1px solid ${color}`, background: `linear-gradient(135deg, rgba(22,24,34,1) 0%, ${hasAlcohol ? 'rgba(255, 32, 0,0.06)' : 'rgba(16,185,129,0.06)'} 100%)` }}>
            <span style={{ background: 'rgba(255,255,255,0.04)', width: 52, height: 52, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '24px' }}>🍺</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasso alcolico attuale</strong>
                <BacInfo />
                {hasActiveLive && (
                  <span className="pulse" style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} /> LIVE
                  </span>
                )}
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color, lineHeight: 1.1, marginTop: '2px' }}>
                {currentBAC.toFixed(2)} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark-secondary)' }}>g/l</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>{msg}</p>
            </div>
          </div>
        );
      })()}

      {/* Peso/sesso e invito si trovano ora nella scheda "Dati" (vedi sotto). */}

      {/* Menu di Navigazione Tab */}
      <div style={{ display: 'flex', gap: '15px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('stats')} 
          style={{
            background: activeTab === 'stats' ? 'rgba(255, 32, 0, 0.1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'stats' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'stats' ? '#FFF' : 'var(--text-dark-secondary)',
            padding: '10px 20px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <TrendingUp size={16} color={activeTab === 'stats' ? 'var(--primary)' : 'currentColor'} />
          Statistiche & Attività
        </button>
        <button 
          onClick={() => setActiveTab('friends')} 
          style={{
            background: activeTab === 'friends' ? 'rgba(255, 32, 0, 0.1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'friends' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'friends' ? '#FFF' : 'var(--text-dark-secondary)',
            padding: '10px 20px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Users size={16} color={activeTab === 'friends' ? 'var(--primary)' : 'currentColor'} />
          Social & Amici
        </button>
        <button
          onClick={() => setActiveTab('data')}
          style={{
            background: activeTab === 'data' ? 'rgba(255, 32, 0, 0.1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'data' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'data' ? '#FFF' : 'var(--text-dark-secondary)',
            padding: '10px 20px', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
            borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <User size={16} color={activeTab === 'data' ? 'var(--primary)' : 'currentColor'} />
          Dati
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          {/* Grid delle Statistiche (Performance Dashboard) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '20px' }}>
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
              <div style={{ fontSize: '15px', fontWeight: '800', marginTop: '12px', color: 'var(--primary)', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.25 }}>
                {favoriteDrink}
              </div>
            </div>
          </div>

          {/* Sezione Centrale: Calendario Heatmap e Attività */}
          <div className="r-grid-feed-sidebar">
            
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
                  
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const dayInfo = getDayAlcolLevel(dayNum);
                    return (
                      <div
                        key={dayNum}
                        onClick={() => handleDayClick(dayNum, dayInfo)}
                        className={`calendar-day ${dayInfo.levelClass}`}
                        title={`${dayNum} ${monthName}: ${dayInfo.units.toFixed(1)} U.A.`}
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
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(223, 255, 0, 0.2)' }}></div>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255, 32, 0, 0.4)' }}></div>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: 'rgba(255, 32, 0, 0.7)' }}></div>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#D81A00' }}></div>
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

          {/* TUTTE LE MIE SESSIONI (cronologico, ogni mese) */}
          <div className="card" style={{ marginTop: '10px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Beer size={20} color="var(--primary)" />
              Le mie sessioni ({activities.length})
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
              Tutte le tue sessioni registrate, dalla più recente. Tocca una sessione per aprirne il dettaglio.
            </p>

            {activities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '34px', color: 'var(--text-dark-secondary)', fontSize: '14px', border: '1px dashed var(--border-dark)', borderRadius: '10px' }}>
                Non hai ancora registrato sessioni. 🍻
              </div>
            ) : (
              <div className="feed-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...activities]
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map((act) => (
                    <Link key={act.id} href={`/?activity=${act.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <article className="card activity-card" style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                          <h4 className="activity-title" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '15px' }}>{act.title}</h4>
                          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', flexShrink: 0 }}>
                            {new Date(act.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="activity-stats">
                          <div className="stat-box">
                            <span className="stat-label">Drink</span>
                            <span className="stat-value highlight">{(act.drinks || []).reduce((s, d) => s + (d.qty || 0), 0)}</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-label">Durata</span>
                            <span className="stat-value">{Math.floor((act.duration || 0) / 60)}h {(act.duration || 0) % 60}m</span>
                          </div>
                          <div className="stat-box">
                            <span className="stat-label">Carico</span>
                            <span className="stat-value">{act.total_units} U.A.</span>
                          </div>
                        </div>
                        {act.location && (
                          <div style={{ fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={13} /> {act.location.name}
                          </div>
                        )}
                      </article>
                    </Link>
                  ))}
              </div>
            )}
          </div>

          {/* MAPPA DEI LUOGHI DEL BERE (Heatmap geografica) */}
          <div className="card" style={{ marginTop: '10px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={20} color="var(--primary)" />
              Mappa delle Bevute 🗺️
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
              Dove hai brindato. Il numero su ogni marker indica quante volte hai registrato una sessione in quel locale.
            </p>
            {drinkPlaces.length > 0 ? (
              <>
                <RouteMap waypoints={drinkPlaces} height="360px" connectLine={false} />
                <div style={{ display: 'flex', gap: '20px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>{drinkPlaces.length}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>Locali visitati</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--secondary)' }}>
                      {drinkPlaces.reduce((s, p) => s + p.label, 0)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>Check-in totali</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-input-dark)', borderRadius: 'var(--radius)', border: '1px dashed var(--border-dark)' }}>
                <MapPin size={32} color="var(--text-dark-secondary)" style={{ marginBottom: '10px' }} />
                <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
                  Nessun luogo ancora sulla mappa. Registra una sessione indicando il <strong>locale</strong> e comparirà qui! 📍
                </p>
              </div>
            )}
          </div>

          {/* ===== PREMI & BADGE ===== */}
          {(() => {
            const sessionsCount = activities.length;
            const totalU = activities.reduce((acc, a) => acc + parseFloat(a.total_units || 0), 0);
            const uniqueBars = new Set(activities.map(a => a.location?.name).filter(Boolean)).size;
            const barHopSessions = activities.filter(a =>
              a.location?.sequence && Array.isArray(a.location.sequence) && a.location.sequence.length > 1
            ).length;
            const maxSingleUnits = activities.reduce((max, a) => Math.max(max, parseFloat(a.total_units || 0)), 0);
            const daysWithSession = new Set(activities.map(a => new Date(a.created_at).toDateString())).size;

            const allBadges = [
              { id: 'first_sip',       icon: '🍺', title: 'Primo Sorso',              desc: 'Prima sessione registrata!',                earned: sessionsCount >= 1,  threshold: '1 sessione' },
              { id: 'habitue',         icon: '🥂', title: 'Habitué',                  desc: '5 sessioni nel taccuino.',                  earned: sessionsCount >= 5,  threshold: '5 sessioni' },
              { id: 'veteran',         icon: '🏅', title: 'Veterano da Bar',           desc: '10 sessioni registrate.',                   earned: sessionsCount >= 10, threshold: '10 sessioni' },
              { id: 'champion',        icon: '🏆', title: 'Campione del Terzo Tempo', desc: '20 sessioni. Sei un\'istituzione.',          earned: sessionsCount >= 20, threshold: '20 sessioni' },
              { id: 'ua_10',           icon: '💪', title: 'Forza Vitale',             desc: '10 U.A. totali consumate.',                 earned: totalU >= 10,        threshold: '10 U.A.' },
              { id: 'ua_50',           icon: '🔥', title: 'Fuoco Sacro',              desc: '50 U.A. totali consumate.',                 earned: totalU >= 50,        threshold: '50 U.A.' },
              { id: 'ua_100',          icon: '💥', title: 'Centometrista',            desc: '100 U.A. totali. Leggendario.',             earned: totalU >= 100,       threshold: '100 U.A.' },
              { id: 'bar_3',           icon: '📍', title: 'Esploratore',              desc: '3 bar diversi visitati.',                   earned: uniqueBars >= 3,     threshold: '3 bar' },
              { id: 'bar_10',          icon: '🗺️', title: 'Cartografo del Bere',     desc: '10 locali diversi sulla mappa.',            earned: uniqueBars >= 10,    threshold: '10 bar' },
              { id: 'barhop_1',        icon: '🔄', title: 'Giramondo',                desc: 'Cambiato bar durante una sessione live.',   earned: barHopSessions >= 1, threshold: '1 giro dei bar' },
              { id: 'barhop_3',        icon: '🎯', title: 'Re del Giro',              desc: '3 sessioni con cambio di bar.',             earned: barHopSessions >= 3, threshold: '3 giri dei bar' },
              { id: 'heavy_session',   icon: '⚡', title: 'Sessione Pesante',         desc: 'Oltre 5 U.A. in una singola sessione.',     earned: maxSingleUnits >= 5, threshold: '5 U.A. in 1 sessione' },
              { id: 'active_7',        icon: '📅', title: 'Settimana di Fuoco',       desc: 'Sessioni in 7 giorni diversi.',             earned: daysWithSession >= 7, threshold: '7 giorni attivi' },
              { id: 'active_30',       icon: '📊', title: 'Allenamento Mensile',      desc: 'Sessioni in 30 giorni diversi.',            earned: daysWithSession >= 30, threshold: '30 giorni attivi' },
            ];

            const earnedBadges = allBadges.filter(b => b.earned);
            const lockedBadges = allBadges.filter(b => !b.earned);

            return (
              <div className="card" style={{ marginTop: '10px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🏅 Premi &amp; Badge
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '18px' }}>
                  Achievement sbloccati automaticamente dalle tue sessioni reali.{' '}
                  <strong style={{ color: earnedBadges.length > 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)' }}>
                    {earnedBadges.length}/{allBadges.length} ottenuti
                  </strong>
                </p>

                {earnedBadges.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dark-secondary)', fontSize: '14px', border: '1px dashed var(--border-dark)', borderRadius: '10px', marginBottom: '16px' }}>
                    🎯 Nessun badge ancora. Registra la tua prima sessione per iniziare!
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 155px), 1fr))', gap: '10px', marginBottom: '16px' }}>
                    {earnedBadges.map(b => (
                      <div key={b.id} style={{ background: 'linear-gradient(135deg, rgba(223, 255, 0,0.10) 0%, rgba(22,24,34,1) 100%)', border: '1px solid rgba(223, 255, 0,0.4)', borderRadius: '10px', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', textAlign: 'center' }}>
                        <span style={{ fontSize: '26px' }}>{b.icon}</span>
                        <strong style={{ fontSize: '11px', color: 'var(--secondary)', fontWeight: '800', lineHeight: 1.2 }}>{b.title}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)', lineHeight: 1.3 }}>{b.desc}</span>
                      </div>
                    ))}
                  </div>
                )}

                {lockedBadges.length > 0 && (
                  <>
                    <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px', letterSpacing: '0.5px' }}>
                      🔒 Da sbloccare:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {lockedBadges.map(b => (
                        <div key={b.id} title={`Sblocca con: ${b.threshold}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '20px', padding: '4px 10px' }}>
                          <span style={{ fontSize: '13px', filter: 'grayscale(1)', opacity: 0.5 }}>{b.icon}</span>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{b.title}</span>
                          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>({b.threshold})</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* SEZIONE STATISTICHE AVANZATE SUMMIT (CURVA BAC & CLASSIFICHE BAR) */}
          <div className="r-grid-2-1" style={{ marginTop: '10px' }}>
            
            {/* Curva Alcolica BAC Settimanale — DATI REALI */}
            {(() => {
              // Calcola picco BAC reale per ciascuno degli ultimi 7 giorni
              // sommando tutti i drink di TUTTE le sessioni di quel giorno
              const weekDays = [];
              const shortDays = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
              const now = new Date();
              for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const dayLabel = shortDays[d.getDay()];
                const dateStr = d.toDateString();
                // Filtra sessioni del giorno
                const daySessions = activities.filter(a => new Date(a.created_at).toDateString() === dateStr);
                // Concatena tutti i drink del giorno
                const allDrinks = daySessions.flatMap(a => (a.drinks || []));
                // Durata totale del giorno: somma delle durate o almeno 60 min
                const totalDuration = daySessions.reduce((acc, a) => acc + (a.duration || 0), 0) || 60;
                const firstCreatedAt = daySessions.length > 0 ? daySessions[0].created_at : d.toISOString();
                // BAC di picco deterministico, coerente con feed/dettaglio/classifica
                // (stesso metodo calculatePeakBAC, con peso e sesso reali dell'utente).
                const peakBac = allDrinks.length > 0
                  ? db.calculatePeakBAC(allDrinks, firstCreatedAt, totalDuration, currentUser?.weight, false, currentUser?.sex)
                  : 0;
                weekDays.push({ label: dayLabel, val: peakBac, sessionsCount: daySessions.length });
              }
              // Scala con headroom (+25%) così le barre non toccano mai il bordo superiore
              const peakBac = Math.max(...weekDays.map(d => d.val), 1.0);
              const maxBac = peakBac * 1.25;
              const hasSomeData = weekDays.some(d => d.val > 0);

              return (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📈 Curva di Ebbrezza BAC Settimanale
                    <BacInfo size={15} />
                    {(!currentUser?.is_premium) && (
                      <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
                    )}
                  </h3>

                  {/* Nota esplicativa */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'rgba(223, 255, 0,0.06)', border: '1px solid rgba(223, 255, 0,0.18)', borderRadius: '8px', padding: '10px 12px' }}>
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>ℹ️</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--secondary)' }}>Riepilogo cumulativo di tutte le sessioni.</strong>{' '}
                      Ogni barra mostra il <em>picco BAC stimato</em> (formula Widmark) raggiunto in quel giorno sommando i drink di <strong>tutte le sessioni</strong> registrate in quella giornata. Non è la curva di una singola sessione.
                    </p>
                  </div>

                  {currentUser?.is_premium ? (
                    <div style={{ padding: '20px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
                      {/* Area grafico: barre e linea limite condividono ESATTAMENTE lo stesso
                          fondo e la stessa scala (niente padding/etichette nel mezzo, così la
                          linea 0.5 g/l è coerente con l'altezza delle barre). */}
                      <div style={{ position: 'relative', height: '160px' }}>
                        {/* Linea limite guida 0.5 g/l, ancorata al fondo del grafico */}
                        <div style={{ position: 'absolute', bottom: `${(0.5 / maxBac) * 100}%`, left: 0, right: 0, height: '0', borderTop: '1px dashed var(--error)', zIndex: 3, pointerEvents: 'none' }} />
                        <span style={{ position: 'absolute', bottom: `calc(${(0.5 / maxBac) * 100}% + 3px)`, right: '4px', fontSize: '9px', color: 'var(--error)', fontWeight: '700', zIndex: 4, pointerEvents: 'none' }}>Limite guida 0.5 g/l</span>

                        {/* Riga barre: stesso contenitore della linea, fondo allineato */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%' }}>
                          {weekDays.map((item, idx) => {
                            const barHeightPct = maxBac > 0 ? Math.max(2, (item.val / maxBac) * 100) : 2;
                            return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', flex: 1, height: '100%', zIndex: 2 }}>
                                {item.val > 0 && (
                                  <span style={{ fontSize: '9px', fontWeight: '700', color: item.val > 0.5 ? 'var(--error)' : 'var(--success)', textAlign: 'center', marginBottom: '2px' }}>{item.val.toFixed(2)}</span>
                                )}
                                <div
                                  title={item.sessionsCount > 0 ? `${item.sessionsCount} sessione/i · BAC picco ${item.val.toFixed(2)} g/l` : 'Nessuna sessione'}
                                  style={{
                                    width: '22px',
                                    height: `${barHeightPct}%`,
                                    flexShrink: 0,
                                    background: item.val === 0 ? 'rgba(255,255,255,0.05)' : item.val > 0.5 ? 'var(--premium-gradient)' : 'var(--success)',
                                    borderRadius: '4px 4px 0 0',
                                    transition: 'height 0.5s ease',
                                    border: item.val === 0 ? '1px dashed rgba(255,255,255,0.08)' : 'none'
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Etichette giorni e sessioni: riga separata SOTTO il grafico */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        {weekDays.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{item.label}</span>
                            {item.sessionsCount > 0 && (
                              <span style={{ fontSize: '8px', color: 'var(--primary)', fontWeight: '700' }}>{item.sessionsCount}s</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {!hasSomeData && (
                        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '12px', fontStyle: 'italic' }}>
                          Nessuna sessione negli ultimi 7 giorni. Inizia a tracciare le tue bevute! 🍻
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', background: 'var(--success)', borderRadius: '2px' }} /> Sotto limite guida
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', background: 'var(--error)', borderRadius: '2px' }} /> Sopra limite guida (0.5 g/l)
                        </span>
                        <span style={{ marginLeft: 'auto' }}>s = sessioni del giorno</span>
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
              );
            })()}

            {/* Classifiche Bar */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🏆 Le tue Classifiche Bar
                {(!currentUser?.is_premium) && (
                  <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
                )}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                Vedi il tuo posizionamento storico nei locali reali in cui hai gareggiato.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {barRankings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dark-secondary)', fontSize: '13px', border: '1px dashed var(--border-dark)', borderRadius: '8px' }}>
                    Non hai ancora classifiche nei locali. Fai check-in in un bar reale durante un brindisi per entrare in classifica! 🍻
                  </div>
                ) : (
                  barRankings.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ fontSize: '13px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</strong>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{b.units.toFixed(1)} U.A. · {b.visits} {b.visits === 1 ? 'visita' : 'visite'}</span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: b.rank === 1 ? 'var(--secondary)' : 'var(--primary)' }}>{b.rank === 1 ? '👑 #1' : `#${b.rank}`}</span>
                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>su {b.total} {b.total === 1 ? 'atleta' : 'atleti'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </>
      )}

      {activeTab === 'friends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Ricerca Amici */}
          <div className="card">
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={20} color="var(--primary)" />
              Trova altri Atleti su Strabar
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
              Cerca i tuoi amici per username o nome visualizzato per seguire le loro bevute e attività nel feed.
            </p>

            <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '24px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Cerca per username o nome visualizzato..."
                value={friendsSearchQuery}
                onChange={(e) => handleSearchFriends(e.target.value)}
                style={{ paddingLeft: '44px', height: '46px', fontSize: '14px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px' }}
              />
            </div>

            {isSearchingFriends ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Ricerca in corso...</p>
            ) : !friendsSearchQuery.trim() ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', fontStyle: 'italic' }}>Digita un nome o username per cercare atleti...</p>
            ) : searchResults.length === 0 ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>Nessun utente registrato trovato.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '15px' }}>
                {searchResults.map((user) => {
                  const isFollowing = followingList.some(f => f.id === user.id);
                  return (
                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div className="activity-avatar" style={{ width: '40px', height: '40px', fontSize: '16px', flexShrink: 0 }}>
                          {user.display_name?.charAt(0) || 'U'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Link href={`/u/${user.id}`} style={{ display: 'block', fontSize: '14px', color: '#FFF', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {user.display_name}
                          </Link>
                          <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'block' }}>@{user.username}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleFollowToggle(user)}
                        className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {isFollowing ? (
                          <>
                            <UserMinus size={12} />
                            Non seguire
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
                            Segui
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Potresti conoscere (amici di amici) */}
            {!friendsSearchQuery.trim() && suggestions.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UserPlus size={18} color="var(--primary)" /> Potresti conoscere
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>
                  Atleti che non segui ancora, magari amici dei tuoi amici.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '12px' }}>
                  {suggestions.map((user) => {
                    const isFollowing = followingList.some((f) => f.id === user.id);
                    return (
                      <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div className="activity-avatar" style={{ width: '40px', height: '40px', fontSize: '16px', flexShrink: 0 }}>
                            {user.display_name?.charAt(0) || 'U'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/u/${user.id}`} style={{ display: 'block', fontSize: '14px', color: '#FFF', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {user.display_name}
                            </Link>
                            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'block' }}>
                              {user.mutualCount > 0 ? `${user.mutualCount} ${user.mutualCount === 1 ? 'amico' : 'amici'} in comune` : `@${user.username}`}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleFollowToggle(user)}
                          className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isFollowing ? <><UserMinus size={12} /> Segui già</> : <><UserPlus size={12} /> Segui</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Liste Seguiti e Seguaci */}
          <div className="r-grid-2">
            {/* Seguiti / Seguaci — conteggi cliccabili, lista caricata ON-DEMAND nel modale */}
            <div className="card" style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={() => setFollowsModal('following')} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '12px', padding: '16px', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--primary)' }}>{followCounts.following}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', fontWeight: 600 }}>Seguiti</div>
              </button>
              <button type="button" onClick={() => setFollowsModal('followers')} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dark)', borderRadius: '12px', padding: '16px', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--secondary)' }}>{followCounts.followers}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', fontWeight: 600 }}>Seguaci</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
            Questi dati servono a calcolare il tuo <strong style={{ color: '#FFF' }}>tasso alcolico</strong> e la curva d&apos;ebbrezza in modo preciso. Restano privati.
          </p>

          {/* Peso corporeo */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 32, 0,0.1)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>⚖️</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>Peso corporeo</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Se non impostato usiamo 70&nbsp;kg.</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <input type="number" inputMode="numeric" min="30" max="250" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} placeholder="70" className="form-control" style={{ width: '90px', height: '42px', textAlign: 'center', fontSize: '16px' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-dark-secondary)' }}>kg</span>
              <button onClick={handleSaveWeight} disabled={savingWeight} className="btn btn-primary" style={{ borderRadius: '20px', padding: '10px 16px', fontSize: '14px', fontWeight: 700 }}>
                {weightSaved ? '✓ Salvato' : savingWeight ? '...' : 'Salva'}
              </button>
            </div>
          </div>

          {/* Sesso biologico */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 32, 0,0.1)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>⚧️</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>Sesso biologico</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Migliora la stima del BAC. Opzionale.</span>
              </div>
            </div>
            <div className="seg-tabs" style={{ flexShrink: 0, width: 'auto', opacity: savingSex ? 0.6 : 1 }}>
              <div className={`seg-tab ${currentUser?.sex === 'm' ? 'active' : ''}`} onClick={() => handleSaveSex('m')}>♂ Uomo</div>
              <div className={`seg-tab ${currentUser?.sex === 'f' ? 'active' : ''}`} onClick={() => handleSaveSex('f')}>♀ Donna</div>
            </div>
          </div>

          {/* Invita amici */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.08) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 32, 0,0.12)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>📲</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>Invita i tuoi amici</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Sfidatevi in classifica e taggatevi nelle sessioni!</span>
              </div>
            </div>
            <ShareAppButton style={{ borderRadius: '20px', padding: '10px 18px', fontSize: '14px', flexShrink: 0 }} />
          </div>

          {/* Impostazioni complete */}
          <Link href="/settings" className="btn btn-secondary" style={{ borderRadius: '20px', padding: '12px', fontSize: '14px', justifyContent: 'center' }}>
            ⚙️ Tutte le impostazioni
          </Link>
        </div>
      )}

      {followsModal && currentUser && (
        <FollowsModal
          userId={currentUser.id}
          initialTab={followsModal}
          counts={followCounts}
          onClose={() => setFollowsModal(null)}
        />
      )}
    </div>
  );
}
