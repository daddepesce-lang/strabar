'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, MessageSquare, Share2, Trophy, Flame, User, Plus, Award, Calendar } from 'lucide-react';

export default function FeedPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState({});
  const [activeCommentsSection, setActiveCommentsSection] = useState({});

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
                    <div className="activity-avatar">
                      {act.profiles?.display_name ? act.profiles.display_name.charAt(0) : 'U'}
                    </div>
                    <div>
                      <div className="activity-author">
                        {act.profiles?.display_name || 'Utente Strabar'}
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

                <h2 className="activity-title">{act.title}</h2>
                {act.description && (
                  <p style={{ color: 'var(--text-dark-primary)', fontSize: '15px', marginBottom: '16px', lineHeight: '1.5' }}>
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

                {act.drank_with && act.drank_with.length > 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '16px', fontStyle: 'italic' }}>
                    👥 In compagnia di: <strong>{act.drank_with.join(', ')}</strong>
                  </div>
                )}

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
                    <span>Esporta Social</span>
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
    </div>
  );
}
