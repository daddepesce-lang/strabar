'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { db } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { Calendar, User, Beer, Award, Heart, Clock, TrendingUp, Info, Search, UserPlus, UserMinus, Users, MapPin, BadgeCheck } from 'lucide-react';
import ShareAppButton from '@/components/ShareAppButton';
import Avatar from '@/components/Avatar';
import BacInfo from '@/components/BacInfo';
import FollowsModal from '@/components/FollowsModal';

const RouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

export default function ProfilePage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dloc = locale === 'en' ? 'en-GB' : 'it-IT';
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayDetails, setSelectedDayDetails] = useState(null);

  // Stati per la scheda Social / Amici
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' o 'friends'
  const [friendsSearchQuery, setFriendsSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsShown, setSuggestionsShown] = useState(5); // "Potresti conoscere": 5 + carica altri
  const [followingList, setFollowingList] = useState([]); // tenuto per compat (handleFollowToggle)
  const [followersList, setFollowersList] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followsModal, setFollowsModal] = useState(null); // 'followers' | 'following' | null
  const [showPastSessions, setShowPastSessions] = useState(false); // mostra solo l'ultima + pulsante
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
      alert(t('profile.weightInvalid'));
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

  // Conteggi follower/seguiti per l'hero (solo COUNT via head-query: egress trascurabile)
  useEffect(() => {
    if (currentUser && typeof db.getFollowCounts === 'function') {
      db.getFollowCounts(currentUser.id).then(setFollowCounts).catch(() => {});
    }
  }, [currentUser]);

  const loadSocialData = async (userId) => {
    try {
      // EGRESS: solo i CONTEGGI follower/seguiti (le liste si aprono on-demand nel modale)
      // e i suggerimenti (versione leggera). Niente più caricamento delle liste intere.
      if (typeof db.getFollowCounts === 'function') {
        setFollowCounts(await db.getFollowCounts(userId));
      }
      // Stato "Segui/Segui già" nei risultati di ricerca e nei suggerimenti: carichiamo
      // SOLO gli ID dei seguiti (egress minimo), tenuti in followingList come {id}.
      if (typeof db.getFollowingIds === 'function') {
        const ids = await db.getFollowingIds(userId);
        setFollowingList(ids.map((id) => ({ id })));
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
      note: `${p.visits} ${p.visits === 1 ? t('profile.visit') : t('profile.visits')} · ${p.units.toFixed(1)} U.A.`,
    }));
  })();

  // Calcola il drink preferito
  const drinkCounts = {};
  activities.forEach(act => {
    act.drinks.forEach(d => {
      drinkCounts[d.name] = (drinkCounts[d.name] || 0) + d.qty;
    });
  });
  let favoriteDrink = t('profile.favNone');
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
  const monthName = calNow.toLocaleDateString(dloc, { month: 'long', year: 'numeric' });

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
          {t('profile.loading')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Intestazione Profilo */}
      <div className="card profile-header" style={{ position: 'relative', textAlign: 'center', background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '22px' }}>
        {/* Azioni in alto a destra */}
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('friends')}
            title={t('profile.searchAthletes')}
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Search size={18} />
          </button>
          <Link
            href="/settings"
            title={t('profile.settingsTitle')}
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}
          >
            ⚙️
          </Link>
        </div>

        {/* Avatar + nome centrati */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <span className="avatar-ring">
            <Avatar src={currentUser?.avatar_url} name={currentUser?.display_name || currentUser?.username} size={84} />
          </span>
          <div>
            <h1 style={{ fontSize: '36px', fontWeight: 400, lineHeight: 1.05, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: 0 }}>
              {currentUser?.display_name}
              {currentUser?.is_premium && (
                <BadgeCheck size={22} color="var(--secondary)" style={{ flexShrink: 0 }} />
              )}
            </h1>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', margin: '4px 0 0' }}>
              @{currentUser?.username} · {t('profile.memberSince')} {new Date(currentUser?.created_at).toLocaleDateString(dloc, { month: 'long', year: 'numeric' })}
            </p>
          </div>
          {currentUser?.is_premium && (
            <span className="badge-premium">⭐ {t('nav.premiumBadge')}</span>
          )}
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0 }}>
            <span onClick={() => setFollowsModal('followers')} style={{ cursor: 'pointer' }}>
              <strong style={{ color: '#fff', fontSize: 16 }}>{followCounts.followers}</strong> {t('profile.followers').toLowerCase()}
            </span>
            {' · '}
            <span onClick={() => setFollowsModal('following')} style={{ cursor: 'pointer' }}>
              <strong style={{ color: '#fff', fontSize: 16 }}>{followCounts.following}</strong> {t('profile.following').toLowerCase()}
            </span>
          </p>
        </div>
      </div>

      {/* Tasso alcolico ATTUALE (adesso) */}
      {(() => {
        const overLimit = currentBAC >= 0.5;        // limite legale alla guida in Italia
        const hasAlcohol = currentBAC > 0;
        const color = overLimit ? 'var(--error)' : hasAlcohol ? 'var(--primary)' : 'var(--success)';
        const msg = overLimit
          ? t('profile.bacOver')
          : hasAlcohol
          ? t('profile.bacSome')
          : t('profile.bacSober');
        return (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '18px' }}>
            <span style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', width: 52, height: 52, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '24px' }}>🍺</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('profile.bacNowTitle')}</strong>
                <BacInfo />
                {hasActiveLive && (
                  <span className="pulse" style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} /> LIVE
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '40px', fontWeight: 400, color, lineHeight: 1, marginTop: '4px' }}>
                {currentBAC.toFixed(2)} <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--text-dark-secondary)' }}>g/l</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>{msg}</p>
            </div>
          </div>
        );
      })()}

      {/* Peso/sesso e invito si trovano ora nella scheda "Dati" (vedi sotto). */}

      {/* Menu di Navigazione Tab (underline, niente pill) */}
      <div className="feed-filter-tabs">
        <button
          onClick={() => setActiveTab('stats')}
          className={`seg-tab ${activeTab === 'stats' ? 'active' : ''}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <TrendingUp size={16} />
          {t('profile.tabStats')}
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`seg-tab ${activeTab === 'friends' ? 'active' : ''}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Users size={16} />
          {t('profile.tabFriends')}
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`seg-tab ${activeTab === 'data' ? 'active' : ''}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <User size={16} />
          {t('profile.tabData')}
        </button>
      </div>

      {activeTab === 'stats' && (
        <>
          {/* 3 stat hero: Sessioni / U.A. Totali / Locali */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '30px', lineHeight: 1, color: '#fff' }}>{activities.length}</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-dark-tertiary)', marginTop: '3px' }}>{t('profile.statSessions')}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '30px', lineHeight: 1, color: 'var(--secondary)' }}>{totalUnits.toFixed(1)}</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-dark-tertiary)', marginTop: '3px' }}>{t('profile.statUnitsShort')}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '30px', lineHeight: 1, color: '#fff' }}>{new Set(activities.map(a => a.location?.name).filter(Boolean)).size}</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-dark-tertiary)', marginTop: '3px' }}>{t('profile.statVenues')}</div>
            </div>
          </div>

          {/* Riga secondaria compatta: drink totali, tempo a tavola, drink preferito */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '6px 16px', fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '-16px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Beer size={13} /> {t('profile.statDrinks')}: <strong style={{ color: '#fff' }}>{totalDrinksCount}</strong>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={13} /> {t('profile.statTime')}: <strong style={{ color: '#fff' }}>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</strong>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Heart size={13} /> {t('profile.statFav')}: <strong style={{ color: '#fff' }}>{favoriteDrink}</strong>
            </span>
          </div>

          {/* Sezione Centrale: Calendario Heatmap e Attività */}
          <div className="r-grid-feed-sidebar">
            
            {/* Calendario delle Bevute (Heatmap) */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} color="var(--primary)" />
                  {t('profile.calTitle')}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>
                  <span>{t('profile.calLess')}</span>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#202027', display: 'inline-block' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(223, 255, 0, .35)', display: 'inline-block' }} />
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF3B2F', display: 'inline-block' }} />
                  <span>{t('profile.calMore')}</span>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
                {t('profile.calDesc')}
              </p>

              <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', padding: '20px', borderRadius: 'var(--radius)' }}>
                <h4 style={{ textAlign: 'center', marginBottom: '15px', fontWeight: '700', color: '#FFF' }}>{monthName}</h4>
                
                <div className="calendar-grid">
                  {[t('profile.dMon'), t('profile.dTue'), t('profile.dWed'), t('profile.dThu'), t('profile.dFri'), t('profile.dSat'), t('profile.dSun')].map(day => (
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

              </div>
            </div>

            {/* Dettagli Giorno Selezionato */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} color="var(--secondary)" />
                {t('profile.dayDetailTitle')}
              </h3>

              {selectedDayDetails ? (
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)', marginBottom: '12px' }}>
                    {selectedDayDetails.day} {monthName}
                  </h4>
                  <div style={{ background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>{t('profile.dayUnits')}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 400, lineHeight: 1.1 }}>{selectedDayDetails.units.toFixed(1)}</div>
                  </div>

                  <strong style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>{t('profile.dayActs')}</strong>
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
                  {t('profile.dayEmpty')}
                </div>
              )}
            </div>
          </div>

          {/* SFIDE & PREMI (spostate qui dalla home: hanno più senso sul profilo) */}
          {(() => {
            const now = new Date();
            const sameDay = (d) => { const x = new Date(d); return x.getDate() === now.getDate() && x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear(); };
            const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
            const todayUnits = activities.reduce((a, x) => a + (sameDay(x.created_at) ? parseFloat(x.total_units || 0) : 0), 0);
            const weeklyUnits = activities.reduce((a, x) => a + (new Date(x.created_at) >= weekAgo ? parseFloat(x.total_units || 0) : 0), 0);
            const uniqueBarsVisited = new Set(activities.map((x) => x.location?.name).filter(Boolean)).size;
            const toursCompleted = activities.filter((x) => /percorso|tour/i.test(x.description || '')).length;
            const Bar = ({ label, sub, value, max, color, valueText, reward, done }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13px', color: '#FFF' }}>{label}</strong>
                  <span style={{ fontSize: '11px', color, fontWeight: 700 }}>{valueText}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{sub}</div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: '100%', background: color, borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: done ? 'var(--success)' : 'var(--text-dark-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Award size={10} /> {t('feed.rewardLabel')}{reward}{done ? t('feed.unlocked') : ''}
                </div>
              </div>
            );
            return (
              <div className="card" style={{ marginTop: '10px', background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', margin: 0 }}>
                  <TrendingUp size={18} color="var(--secondary)" /> {t('profile.challengesTitle')}
                </h3>
                <Bar label={t('feed.ch1Title')} sub={t('feed.ch1Desc')} value={toursCompleted} max={3} color="var(--secondary)" valueText={t('feed.ch1Count', { n: toursCompleted })} reward={t('feed.ch1Reward')} done={toursCompleted >= 3} />
                <Bar label={t('feed.ch2Title')} sub={t('feed.ch2Desc')} value={weeklyUnits} max={10} color="var(--primary)" valueText={t('feed.ch2Count', { n: weeklyUnits.toFixed(1) })} reward={t('feed.ch2Reward')} done={weeklyUnits >= 10} />
                <Bar label={t('feed.ch3Title')} sub={t('feed.ch3Desc')} value={uniqueBarsVisited} max={5} color="#10B981" valueText={t('feed.ch3Count', { n: uniqueBarsVisited })} reward={t('feed.ch3Reward')} done={uniqueBarsVisited >= 5} />
                <Bar label={t('feed.ch4Title')} sub={t('feed.ch4Desc')} value={Math.min(todayUnits, 4)} max={4} color={todayUnits > 4 ? 'var(--error)' : 'var(--success)'} valueText={t('feed.ch4Count', { n: todayUnits.toFixed(1) })} reward={todayUnits > 4 ? t('feed.ch4Exceeded') : t('feed.ch4Reward')} done={todayUnits > 0 && todayUnits <= 4} />
              </div>
            );
          })()}

          {/* TUTTE LE MIE SESSIONI (cronologico, ogni mese) */}
          <div className="card" style={{ marginTop: '10px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Beer size={20} color="var(--primary)" />
              {t('profile.sessionsTitle', { n: activities.length })}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
              {showPastSessions ? t('profile.sessionsAll') : t('profile.sessionsLast')} {t('profile.sessionsTap')}
            </p>

            {activities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '34px', color: 'var(--text-dark-secondary)', fontSize: '14px', border: '1px dashed var(--border-dark)', borderRadius: '10px' }}>
                {t('profile.sessionsEmpty')}
              </div>
            ) : (() => {
              const sorted = [...activities].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
              const visible = showPastSessions ? sorted : sorted.slice(0, 1);
              return (
                <>
                  <div className="feed-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {visible.map((act) => (
                      <Link key={act.id} href={`/?activity=${act.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                        <article className="card activity-card" style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                            <h4 className="activity-title" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '15px' }}>{act.title}</h4>
                            <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', flexShrink: 0 }}>
                              {new Date(act.created_at).toLocaleDateString(dloc, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="activity-stats">
                            <div className="stat-box">
                              <span className="stat-label">{t('profile.sDrink')}</span>
                              <span className="stat-value highlight">{(act.drinks || []).reduce((s, d) => s + (d.qty || 0), 0)}</span>
                            </div>
                            <div className="stat-box">
                              <span className="stat-label">{t('profile.sDuration')}</span>
                              <span className="stat-value">{Math.floor((act.duration || 0) / 60)}h {(act.duration || 0) % 60}m</span>
                            </div>
                            <div className="stat-box">
                              <span className="stat-label">{t('profile.sLoad')}</span>
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
                  {sorted.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowPastSessions((v) => !v)}
                      className="btn btn-secondary"
                      style={{ width: '100%', marginTop: '12px', borderRadius: '20px', padding: '12px', fontSize: '14px', fontWeight: 700 }}
                    >
                      {showPastSessions ? t('profile.hidePast') : t('profile.showPast', { n: sorted.length - 1 })}
                    </button>
                  )}
                </>
              );
            })()}
          </div>

          {/* MAPPA DEI LUOGHI DEL BERE (Heatmap geografica) */}
          <div className="card" style={{ marginTop: '10px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={20} color="var(--primary)" />
              {t('profile.mapTitle')}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px' }}>
              {t('profile.mapDesc')}
            </p>
            {drinkPlaces.length > 0 ? (
              <>
                <RouteMap waypoints={drinkPlaces} height="360px" connectLine={false} />
                <div style={{ display: 'flex', gap: '24px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 400, lineHeight: 1, color: '#fff' }}>{drinkPlaces.length}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{t('profile.mapVenues')}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 400, lineHeight: 1, color: '#fff' }}>
                      {drinkPlaces.reduce((s, p) => s + p.label, 0)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{t('profile.mapCheckins')}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-input-dark)', borderRadius: 'var(--radius)', border: '1px dashed var(--border-dark)' }}>
                <MapPin size={32} color="var(--text-dark-secondary)" style={{ marginBottom: '10px' }} />
                <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>
                  {t('profile.mapEmptyPre')}<strong>{t('profile.mapEmptyBold')}</strong>{t('profile.mapEmptyPost')}
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

            const bdg = (id, earned) => ({ id, earned, title: t(`profile.bdg.${id}.t`), desc: t(`profile.bdg.${id}.d`), threshold: t(`profile.bdg.${id}.th`) });
            const allBadges = [
              { ...bdg('first_sip', sessionsCount >= 1), icon: '🍺' },
              { ...bdg('habitue', sessionsCount >= 5), icon: '🥂' },
              { ...bdg('veteran', sessionsCount >= 10), icon: '🏅' },
              { ...bdg('champion', sessionsCount >= 20), icon: '🏆' },
              { ...bdg('ua_10', totalU >= 10), icon: '💪' },
              { ...bdg('ua_50', totalU >= 50), icon: '🔥' },
              { ...bdg('ua_100', totalU >= 100), icon: '💥' },
              { ...bdg('bar_3', uniqueBars >= 3), icon: '📍' },
              { ...bdg('bar_10', uniqueBars >= 10), icon: '🗺️' },
              { ...bdg('barhop_1', barHopSessions >= 1), icon: '🔄' },
              { ...bdg('barhop_3', barHopSessions >= 3), icon: '🎯' },
              { ...bdg('heavy_session', maxSingleUnits >= 5), icon: '⚡' },
              { ...bdg('active_7', daysWithSession >= 7), icon: '📅' },
              { ...bdg('active_30', daysWithSession >= 30), icon: '📊' },
            ];

            const earnedBadges = allBadges.filter(b => b.earned);
            const lockedBadges = allBadges.filter(b => !b.earned);

            // Tile premium 56x56: conquistati = gradiente scuro tinto (lime / rosso / neutro),
            // bloccati = spenti; oltre il limite mostrabile → tile "+N" tratteggiata.
            const MAX_TILES = 11;
            const ordered = [...earnedBadges, ...lockedBadges];
            const shown = ordered.slice(0, MAX_TILES);
            const hiddenCount = ordered.length - shown.length;
            const earnedTints = [
              { background: 'linear-gradient(145deg, #2a2412, #141419)', border: '1px solid rgba(223, 255, 0, .35)', boxShadow: '0 0 16px rgba(223, 255, 0, .12)' },
              { background: 'linear-gradient(145deg, #2a1512, #141419)', border: '1px solid rgba(255, 59, 47, .35)', boxShadow: '0 0 16px rgba(255, 59, 47, .12)' },
              { background: 'linear-gradient(145deg, #1c1c24, #141419)', border: '1px solid rgba(255, 255, 255, .08)', boxShadow: 'none' },
            ];

            return (
              <div className="card" style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                  <strong style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{t('profile.badgesHeader')}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{earnedBadges.length} / {allBadges.length}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {shown.map((b, i) => (
                    <div
                      key={b.id}
                      title={b.earned ? `${b.title} — ${b.desc}` : `${b.title} · ${t('profile.badgeUnlockWith', { th: b.threshold })}`}
                      style={{
                        width: '56px', height: '56px', borderRadius: '16px', fontSize: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        ...(b.earned
                          ? earnedTints[i % earnedTints.length]
                          : { background: '#101014', border: '1px solid rgba(255, 255, 255, .05)', opacity: 0.25 }),
                      }}
                    >
                      {b.icon}
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <div style={{ minWidth: '56px', height: '56px', borderRadius: '16px', padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255, 255, 255, .12)', fontSize: '12px', color: 'var(--text-dark-tertiary)' }}>
                      +{hiddenCount}
                    </div>
                  )}
                </div>
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
              const shortDays = [t('profile.dSun'), t('profile.dMon'), t('profile.dTue'), t('profile.dWed'), t('profile.dThu'), t('profile.dFri'), t('profile.dSat')];
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
                    {t('profile.bacWeekTitle')}
                    <BacInfo size={15} />
                    {(!currentUser?.is_premium) && (
                      <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
                    )}
                  </h3>

                  {/* Nota esplicativa */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'rgba(223, 255, 0,0.06)', border: '1px solid rgba(223, 255, 0,0.18)', borderRadius: '8px', padding: '10px 12px' }}>
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>ℹ️</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--secondary)' }}>{t('profile.bacWeekNoteBold')}</strong>{t('profile.bacWeekNote')}
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
                        <span style={{ position: 'absolute', bottom: `calc(${(0.5 / maxBac) * 100}% + 3px)`, right: '4px', fontSize: '9px', color: 'var(--error)', fontWeight: '700', zIndex: 4, pointerEvents: 'none' }}>{t('profile.limitLine')}</span>

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
                          {t('profile.bacWeekEmpty')}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', background: 'var(--success)', borderRadius: '2px' }} /> {t('profile.underLimit')}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', background: 'var(--error)', borderRadius: '2px' }} /> {t('profile.overLimitLeg')}
                        </span>
                        <span style={{ marginLeft: 'auto' }}>{t('profile.sLegend')}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', border: '1px dashed var(--border-dark)', minHeight: '220px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>{t('profile.summitTitle')}</div>
                      <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', maxWidth: '350px', marginBottom: '20px' }}>
                        {t('profile.summitDesc')}
                      </p>
                      <Link href="/premium" className="btn btn-premium" style={{ padding: '8px 18px', fontSize: '13px' }}>
                        {t('profile.summitCta')}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Classifiche Bar */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {t('profile.barRankTitle')}
                {(!currentUser?.is_premium) && (
                  <span className="badge-premium" style={{ fontSize: '9px' }}>SUMMIT</span>
                )}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                {t('profile.barRankDesc')}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {barRankings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dark-secondary)', fontSize: '13px', border: '1px dashed var(--border-dark)', borderRadius: '8px' }}>
                    {t('profile.barRankEmpty')}
                  </div>
                ) : (
                  barRankings.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ fontSize: '13px', color: '#FFF', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</strong>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '2px' }}>{b.units.toFixed(1)} U.A. · {b.visits} {b.visits === 1 ? t('profile.visit') : t('profile.visits')}</span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: b.rank === 1 ? 'var(--secondary)' : 'var(--primary)' }}>{b.rank === 1 ? '👑 #1' : `#${b.rank}`}</span>
                        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{t('profile.outOf', { n: b.total, label: b.total === 1 ? t('profile.athlete') : t('profile.athletes') })}</span>
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
              {t('profile.friendsTitle')}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
              {t('profile.friendsDesc')}
            </p>

            <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '24px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
              <input
                type="text"
                className="form-control"
                placeholder={t('profile.friendsSearchPh')}
                value={friendsSearchQuery}
                onChange={(e) => handleSearchFriends(e.target.value)}
                style={{ paddingLeft: '44px', height: '46px', fontSize: '14px', background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '10px' }}
              />
            </div>

            {isSearchingFriends ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>{t('profile.searching')}</p>
            ) : !friendsSearchQuery.trim() ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', fontStyle: 'italic' }}>{t('profile.friendsTypeHint')}</p>
            ) : searchResults.length === 0 ? (
              <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>{t('profile.noUsers')}</p>
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
                            {t('profile.unfollow')}
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
                            {t('profile.follow')}
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
                  <UserPlus size={18} color="var(--primary)" /> {t('profile.mightKnow')}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>
                  {t('profile.mightKnowDesc')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '12px' }}>
                  {suggestions.slice(0, suggestionsShown).map((user) => {
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
                              {user.mutualCount > 0 ? t('profile.mutual', { n: user.mutualCount, label: user.mutualCount === 1 ? t('profile.friend') : t('profile.friends') }) : `@${user.username}`}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleFollowToggle(user)}
                          className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isFollowing ? <><UserMinus size={12} /> {t('profile.followingAlready')}</> : <><UserPlus size={12} /> {t('profile.follow')}</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {suggestions.length > suggestionsShown && (
                  <button
                    type="button"
                    onClick={() => setSuggestionsShown((n) => n + 5)}
                    className="btn btn-secondary"
                    style={{ marginTop: '12px', borderRadius: '20px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', marginRight: 'auto' }}
                  >
                    <UserPlus size={14} /> {t('profile.loadMore', { n: suggestions.length - suggestionsShown })}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Liste Seguiti e Seguaci */}
          <div className="r-grid-2">
            {/* Seguiti / Seguaci — conteggi cliccabili, lista caricata ON-DEMAND nel modale */}
            <div className="card" style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={() => setFollowsModal('following')} style={{ flex: 1, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '16px 8px', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 400, lineHeight: 1, color: '#fff' }}>{followCounts.following}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{t('profile.following')}</div>
              </button>
              <button type="button" onClick={() => setFollowsModal('followers')} style={{ flex: 1, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: '16px', padding: '16px 8px', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 400, lineHeight: 1, color: '#fff' }}>{followCounts.followers}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dark-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{t('profile.followers')}</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
            {t('profile.dataIntroPre')}<strong style={{ color: '#FFF' }}>{t('profile.dataIntroBold')}</strong>{t('profile.dataIntroPost')}
          </p>

          {/* Peso corporeo */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 59, 47,0.1)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>⚖️</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>{t('profile.weightTitle')}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{t('profile.weightSub')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <input type="number" inputMode="numeric" min="30" max="250" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} placeholder="70" className="form-control" style={{ width: '90px', height: '42px', textAlign: 'center', fontSize: '16px' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-dark-secondary)' }}>kg</span>
              <button onClick={handleSaveWeight} disabled={savingWeight} className="btn btn-primary" style={{ borderRadius: '20px', padding: '10px 16px', fontSize: '14px', fontWeight: 700 }}>
                {weightSaved ? t('profile.saved') : savingWeight ? '...' : t('profile.save')}
              </button>
            </div>
          </div>

          {/* Sesso biologico */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 59, 47,0.1)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>⚧️</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>{t('profile.sexTitle')}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{t('profile.sexSub')}</span>
              </div>
            </div>
            <div className="seg-tabs" style={{ flexShrink: 0, width: 'auto', opacity: savingSex ? 0.6 : 1 }}>
              <div className={`seg-tab ${currentUser?.sex === 'm' ? 'active' : ''}`} onClick={() => handleSaveSex('m')}>{t('profile.male')}</div>
              <div className={`seg-tab ${currentUser?.sex === 'f' ? 'active' : ''}`} onClick={() => handleSaveSex('f')}>{t('profile.female')}</div>
            </div>
          </div>

          {/* Invita amici */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ background: 'rgba(255, 59, 47,0.12)', color: 'var(--primary)', width: 42, height: 42, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>📲</span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '15px', display: 'block' }}>{t('profile.inviteTitle')}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{t('profile.inviteSub')}</span>
              </div>
            </div>
            <ShareAppButton style={{ borderRadius: '20px', padding: '10px 18px', fontSize: '14px', flexShrink: 0 }} />
          </div>

          {/* Impostazioni complete */}
          <Link href="/settings" className="btn btn-secondary" style={{ borderRadius: '20px', padding: '12px', fontSize: '14px', justifyContent: 'center' }}>
            {t('profile.allSettings')}
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
