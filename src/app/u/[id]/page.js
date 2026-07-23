'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { publicName, publicUsername } from '@/lib/names';
import Avatar from '@/components/Avatar';
import BacInfo from '@/components/BacInfo';
import FollowsModal from '@/components/FollowsModal';
import { useT, useI18n } from '@/lib/i18n';
import { localizeDrink } from '@/lib/drinkLabel';
import { locationDisplayName } from '@/lib/sessionLabels';
import {
  Beer, Award, TrendingUp, Clock, Heart, UserPlus, UserMinus, Users,
  ArrowLeft, CalendarPlus, MapPin, Sparkles,
} from 'lucide-react';

export default function AthleteProfilePage({ params }) {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const { id } = use(params);

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activities, setActivities] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followsMe, setFollowsMe] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [followsModal, setFollowsModal] = useState(null); // 'followers' | 'following' | null

  // Orario corrente: aggiornato ogni minuto per tenere "vivo" il tasso alcolico mostrato.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const me = await db.getCurrentUser();
      setCurrentUser(me);

      if (me && me.id === id) {
        router.replace('/profile');
        return;
      }

      // EGRESS: niente liste intere di follower/seguiti. Solo i CONTEGGI (count query) e,
      // se loggato, lo stato di follow reciproco con 2 check a riga singola. Le liste si
      // caricano on-demand aprendo il modale.
      const [prof, acts, counts] = await Promise.all([
        db.getUserProfile(id),
        db.getUserActivities(id),
        typeof db.getFollowCounts === 'function' ? db.getFollowCounts(id) : Promise.resolve({ followers: 0, following: 0 }),
      ]);
      setProfile(prof);
      setActivities(acts);
      setFollowCounts(counts);

      if (me && typeof db.getFollowStatus === 'function') {
        const st = await db.getFollowStatus(id);
        setIsFollowing(st.iFollow);
        setFollowsMe(st.followsMe);
        setIsFriend(st.iFollow && st.followsMe); // amico = follow reciproco
      }
    } catch (err) {
      console.error('Errore caricamento profilo atleta:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleFollowToggle = async () => {
    if (!currentUser) {
      router.push('/auth');
      return;
    }
    setBusy(true);
    try {
      if (isFollowing) {
        await db.unfollowUser(id);
      } else {
        await db.followUser(id);
      }
      await load();
    } catch (err) {
      alert(err.message || t('userprofile.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          {t('userprofile.loadingProfile')}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>{t('userprofile.notFoundTitle')}</h2>
        <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
          {t('userprofile.notFoundText')}
        </p>
        <Link href="/" className="btn btn-primary">{t('userprofile.backToFeed')}</Link>
      </div>
    );
  }

  // SOLO le sessioni create da questo atleta (non quelle in cui è taggato),
  // e filtrate per PRIVACY: pubbliche sempre; "amici" solo se c'è un collegamento di
  // follow (io seguo lui o lui segue me); private mai (qui è sempre un altro utente).
  const theyFollowMe = !!(currentUser && followsMe);
  const canSeeFriends = isFollowing || theyFollowMe;
  const combinedActivities = activities
    .filter((a) => {
      const s = a.location?.share;
      if (s === 'private') return false;
      if (s === 'friends') return canSeeFriends;
      return true; // pubbliche o storiche senza flag
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Statistiche: solo sessioni proprie e visibili
  const totalDrinks = combinedActivities.reduce((acc, a) => acc + (a.drinks || []).reduce((s, d) => s + (d.qty || 0), 0), 0);
  const totalUnits = combinedActivities.reduce((acc, a) => acc + parseFloat(a.total_units || 0), 0);
  const totalMinutes = combinedActivities.reduce((acc, a) => acc + (a.duration || 0), 0);

  // Conta per id/typeKey/nome e tiene un drink rappresentante, così il "preferito" si
  // mostra localizzato (id di catalogo o categoria) invece del nome grezzo salvato.
  const drinkCounts = {};
  const drinkRepr = {};
  combinedActivities.forEach((a) => (a.drinks || []).forEach((d) => {
    const key = d.id || d.typeKey || d.name;
    drinkCounts[key] = (drinkCounts[key] || 0) + (d.qty || 0);
    if (!drinkRepr[key]) drinkRepr[key] = d;
  }));
  let favoriteDrink = t('userprofile.noneFavorite');
  let favoriteDrinkObj = null;
  let maxQty = 0;
  Object.entries(drinkCounts).forEach(([key, qty]) => { if (qty > maxQty) { maxQty = qty; favoriteDrinkObj = drinkRepr[key]; } });
  if (favoriteDrinkObj) favoriteDrink = localizeDrink(favoriteDrinkObj, locale).name;

  // Tasso alcolico attuale dell'atleta (solo se ha scelto di renderlo pubblico).
  // Calcolato come sul proprio profilo: sessione live in corso + residuo recente.
  const currentBAC = (() => {
    if (!profile?.show_bac_public || activities.length === 0) return 0;
    const nowISO = new Date(now).toISOString();
    const weight = profile.weight;
    const sex = profile.sex;
    const w = parseFloat(weight) > 0 ? parseFloat(weight) : 70;
    const r = db._widmarkR(sex);
    const active = activities.find(
      (a) => a.is_active && now - new Date(a.created_at).getTime() < 5 * 60 * 60 * 1000
    );
    if (active) {
      const duration = Math.max(1, Math.round((now - new Date(active.created_at).getTime()) / 60000));
      // Residuo CONGELATO sulla sessione: stesso valore che vede il proprietario.
      const residual = db.sessionResidualGrams(active, activities, weight, sex);
      return db.calculateCurrentBAC(active.drinks || [], active.created_at, duration, nowISO, weight, active.full_stomach, sex, residual);
    }
    const residual = db.residualGramsAtTime(activities, nowISO, weight, sex);
    return parseFloat((residual / (w * r)).toFixed(2));
  })();
  const hasActiveLive = profile?.show_bac_public && activities.some(
    (a) => a.is_active && now - new Date(a.created_at).getTime() < 5 * 60 * 60 * 1000
  );

  const formatDate = (ds) => new Date(ds).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Link href="/profile" className="action-btn" style={{ fontSize: '14px', width: 'fit-content' }}>
        <ArrowLeft size={16} /> {t('userprofile.back')}
      </Link>

      {/* Intestazione profilo amico */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 59, 47,0.06) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <Avatar src={profile.avatar_url} name={publicName(profile)} size={76} style={{ border: '3px solid var(--primary)' }} />
          <div style={{ flex: 1, minWidth: '180px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {publicName(profile)}
              {profile.is_premium && (
                <span className="badge-premium"><Award size={12} /> Premium</span>
              )}
              {isFriend && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,0.12)', padding: '3px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={11} /> {t('userprofile.friendBadge')}
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '2px' }}>
              {publicUsername(profile) && <>@{publicUsername(profile)} •{' '}</>}
              <button type="button" onClick={() => setFollowsModal('following')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontSize: '14px' }}>
                <strong style={{ color: '#FFF' }}>{followCounts.following}</strong> {t('userprofile.following')}
              </button>
              {' • '}
              <button type="button" onClick={() => setFollowsModal('followers')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontSize: '14px' }}>
                <strong style={{ color: '#FFF' }}>{followCounts.followers}</strong> {t('userprofile.followers')}
              </button>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleFollowToggle}
              disabled={busy}
              className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
              style={{ borderRadius: '20px' }}
            >
              {isFollowing ? (<><UserMinus size={16} /> {t('userprofile.unfollow')}</>) : (<><UserPlus size={16} /> {t('userprofile.follow')}</>)}
            </button>
            <Link
              href={`/events?invite=${profile.id}`}
              className="btn btn-secondary"
              style={{ borderRadius: '20px' }}
            >
              <CalendarPlus size={16} /> {t('userprofile.inviteToEvent')}
            </Link>
          </div>
        </div>
      </div>

      {/* Statistiche */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary)', marginBottom: '8px' }}><Beer size={26} /></div>
          <span className="stat-label">{t('userprofile.totalDrinks')}</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalDrinks}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--secondary)', marginBottom: '8px' }}><TrendingUp size={26} /></div>
          <span className="stat-label">{t('userprofile.alcoholUnits')}</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalUnits.toFixed(1)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#10B981', marginBottom: '8px' }}><Clock size={26} /></div>
          <span className="stat-label">{t('userprofile.timeAtTable')}</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#3B82F6', marginBottom: '8px' }}><Heart size={26} /></div>
          <span className="stat-label">{t('userprofile.favoriteDrink')}</span>
          <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '12px', color: 'var(--primary)', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.25 }}>{favoriteDrink}</div>
        </div>
      </div>

      {/* Tasso alcolico attuale dell'atleta (solo se lo ha reso pubblico) */}
      {profile.show_bac_public && (() => {
        const overLimit = currentBAC >= 0.5;
        const hasAlcohol = currentBAC > 0;
        const color = overLimit ? 'var(--error)' : hasAlcohol ? 'var(--primary)' : 'var(--success)';
        return (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', border: `1px solid ${color}`, background: `linear-gradient(135deg, rgba(22,24,34,1) 0%, ${hasAlcohol ? 'rgba(255, 59, 47,0.06)' : 'rgba(16,185,129,0.06)'} 100%)` }}>
            <span style={{ background: 'rgba(255,255,255,0.04)', width: 52, height: 52, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '24px' }}>🍺</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', color: 'var(--text-dark-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('userprofile.currentBac')}</strong>
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
            </div>
          </div>
        );
      })()}

      {/* Attività recenti */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} color="var(--primary)" /> {t('userprofile.activitiesOf', { name: publicName(profile) })}
        </h2>

        {combinedActivities.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '34px', color: 'var(--text-dark-secondary)' }}>
            {t('userprofile.noSessions')}
          </div>
        ) : (
          <div className="feed-list">
            {combinedActivities.map((act) => (
              <Link key={act.id} href={`/?activity=${act.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <article className="card activity-card" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                  <h3 className="activity-title" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{formatDate(act.created_at)}</span>
                  </div>
                </div>
                {act.description && (
                  <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginBottom: '12px' }}>{act.description}</p>
                )}
                <div className="activity-stats">
                  <div className="stat-box">
                    <span className="stat-label">{t('userprofile.drink')}</span>
                    <span className="stat-value highlight">{(act.drinks || []).reduce((s, d) => s + d.qty, 0)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">{t('userprofile.duration')}</span>
                    <span className="stat-value">{Math.floor(act.duration / 60)}h {act.duration % 60}m</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">{t('userprofile.load')}</span>
                    <span className="stat-value">{act.total_units} {t('userprofile.unitsAbbr')}</span>
                  </div>
                </div>
                {act.location && (
                  <div style={{ fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={13} /> {locationDisplayName(act.location, t)}
                  </div>
                )}
              </article>
              </Link>
            ))}
          </div>
        )}
      </div>

      {followsModal && (
        <FollowsModal
          userId={id}
          initialTab={followsModal}
          counts={followCounts}
          onClose={() => setFollowsModal(null)}
        />
      )}
    </div>
  );
}
