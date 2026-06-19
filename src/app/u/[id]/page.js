'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import Avatar from '@/components/Avatar';
import {
  Beer, Award, TrendingUp, Clock, Heart, UserPlus, UserMinus, Users,
  ArrowLeft, CalendarPlus, MapPin, Sparkles,
} from 'lucide-react';

export default function AthleteProfilePage({ params }) {
  const router = useRouter();
  const { id } = use(params);

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activities, setActivities] = useState([]);
  const [taggedActivities, setTaggedActivities] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const me = await db.getCurrentUser();
      setCurrentUser(me);

      if (me && me.id === id) {
        router.replace('/profile');
        return;
      }

      const [prof, acts, fol, fers] = await Promise.all([
        db.getUserProfile(id),
        db.getUserActivities(id),
        db.getFollowing(id),
        db.getFollowers(id),
      ]);
      setProfile(prof);
      setActivities(acts);
      setFollowing(fol);
      setFollowers(fers);
      // Attività in cui questo atleta è stato taggato da altri
      if (prof?.username) {
        setTaggedActivities(await db.getTaggedActivities(prof.username, id));
      }

      if (me) {
        const followingMe = await db.getFollowing(me.id);
        const amFollowing = followingMe.some((f) => f.id === id);
        setIsFollowing(amFollowing);
        // amico = follow reciproco
        setIsFriend(amFollowing && fers.some((f) => f.id === me.id));
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
      alert(err.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>
          Carico il profilo atleta... 🍺
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Atleta non trovato 🤷</h2>
        <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '20px' }}>
          Questo profilo non esiste o è stato rimosso.
        </p>
        <Link href="/" className="btn btn-primary">Torna al Feed</Link>
      </div>
    );
  }

  // Lista combinata: sessioni create + sessioni in cui è taggato (marcate)
  const combinedActivities = [
    ...activities.map((a) => ({ ...a, _tagged: false })),
    ...taggedActivities.map((a) => ({ ...a, _tagged: true })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Statistiche (includono sia le sessioni create sia quelle in cui è stato taggato)
  const totalDrinks = combinedActivities.reduce((acc, a) => acc + (a.drinks || []).reduce((s, d) => s + (d.qty || 0), 0), 0);
  const totalUnits = combinedActivities.reduce((acc, a) => acc + parseFloat(a.total_units || 0), 0);
  const totalMinutes = combinedActivities.reduce((acc, a) => acc + (a.duration || 0), 0);

  const drinkCounts = {};
  combinedActivities.forEach((a) => (a.drinks || []).forEach((d) => { drinkCounts[d.name] = (drinkCounts[d.name] || 0) + (d.qty || 0); }));
  let favoriteDrink = 'Nessuno';
  let maxQty = 0;
  Object.entries(drinkCounts).forEach(([name, qty]) => { if (qty > maxQty) { maxQty = qty; favoriteDrink = name; } });

  const formatDate = (ds) => new Date(ds).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Link href="/profile" className="action-btn" style={{ fontSize: '14px', width: 'fit-content' }}>
        <ArrowLeft size={16} /> Indietro
      </Link>

      {/* Intestazione profilo amico */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.06) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <Avatar src={profile.avatar_url} name={profile.display_name || profile.username} size={76} style={{ border: '3px solid var(--primary)' }} />
          <div style={{ flex: 1, minWidth: '180px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {profile.display_name}
              {profile.is_premium && (
                <span className="badge-premium"><Award size={12} /> Premium</span>
              )}
              {isFriend && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,0.12)', padding: '3px 10px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={11} /> Amico
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginTop: '2px' }}>
              @{profile.username} • {following.length} seguiti • {followers.length} seguaci
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleFollowToggle}
              disabled={busy}
              className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
              style={{ borderRadius: '20px' }}
            >
              {isFollowing ? (<><UserMinus size={16} /> Smetti di seguire</>) : (<><UserPlus size={16} /> Segui</>)}
            </button>
            <Link
              href={`/events?invite=${profile.id}`}
              className="btn btn-secondary"
              style={{ borderRadius: '20px' }}
            >
              <CalendarPlus size={16} /> Invita a un evento
            </Link>
          </div>
        </div>
      </div>

      {/* Statistiche */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary)', marginBottom: '8px' }}><Beer size={26} /></div>
          <span className="stat-label">Drink Totali</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalDrinks}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--secondary)', marginBottom: '8px' }}><TrendingUp size={26} /></div>
          <span className="stat-label">Unità Alcoliche</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalUnits.toFixed(1)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#10B981', marginBottom: '8px' }}><Clock size={26} /></div>
          <span className="stat-label">Tempo al Tavolo</span>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#3B82F6', marginBottom: '8px' }}><Heart size={26} /></div>
          <span className="stat-label">Drink Preferito</span>
          <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '12px', color: 'var(--primary)' }}>{favoriteDrink}</div>
        </div>
      </div>

      {/* Attività recenti */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} color="var(--primary)" /> Attività di {profile.display_name}
        </h2>

        {combinedActivities.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '34px', color: 'var(--text-dark-secondary)' }}>
            Questo atleta non ha ancora registrato sessioni. 🍻
          </div>
        ) : (
          <div className="feed-list">
            {combinedActivities.map((act) => (
              <article key={`${act._tagged ? 'tag' : 'own'}-${act.id}`} className="card activity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                  <h3 className="activity-title" style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {act._tagged && (
                      <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--secondary)', background: 'rgba(223, 255, 0,0.12)', padding: '3px 8px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Users size={11} /> Taggato
                      </span>
                    )}
                    <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{formatDate(act.created_at)}</span>
                  </div>
                </div>
                {act._tagged && (
                  <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>
                    Sessione di{' '}
                    <Link href={`/u/${act.user_id}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                      {act.profiles?.display_name || 'un atleta'}
                    </Link>
                  </p>
                )}
                {act.description && (
                  <p style={{ color: 'var(--text-dark-secondary)', fontSize: '14px', marginBottom: '12px' }}>{act.description}</p>
                )}
                <div className="activity-stats">
                  <div className="stat-box">
                    <span className="stat-label">Drink</span>
                    <span className="stat-value highlight">{(act.drinks || []).reduce((s, d) => s + d.qty, 0)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Durata</span>
                    <span className="stat-value">{Math.floor(act.duration / 60)}h {act.duration % 60}m</span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
