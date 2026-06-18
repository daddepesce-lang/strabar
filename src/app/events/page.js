'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
  Calendar, Plus, MapPin, Users, Clock, X, Check,
  CalendarPlus, Route as RouteIcon, Crown,
} from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';

function formatEventDate(ds) {
  if (!ds) return 'Data da definire';
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

const RSVP_LABEL = { going: 'Partecipo', maybe: 'Forse', no: 'Non posso' };

export default function EventsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming'); // upcoming | mine | invites

  // Form di creazione
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [invited, setInvited] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      const [evs, rts] = await Promise.all([db.getEvents(), db.getRoutes()]);
      setEvents(evs);
      setRoutes(rts);
      if (user) {
        const fol = await db.getFollowing(user.id);
        setFollowing(fol);
      }
    } catch (err) {
      console.error('Errore caricamento eventi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Preselezione amico da invitare via ?invite=<id>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId && currentUser) {
      setInvited((prev) => (prev.includes(inviteId) ? prev : [...prev, inviteId]));
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const toggleInvite = (uid) => {
    setInvited((prev) => (prev.includes(uid) ? prev.filter((i) => i !== uid) : [...prev, uid]));
  };

  const handleCreate = async () => {
    if (!title.trim()) { alert('Dai un titolo al tuo evento!'); return; }
    if (!date) { alert('Scegli una data e un orario!'); return; }
    setSaving(true);
    try {
      const selectedRoute = routes.find((r) => r.id === routeId);
      const ev = await db.createEvent({
        title, description: desc, date,
        location_name: locationName,
        route_id: routeId || null,
        route_name: selectedRoute?.name || null,
        invited,
      });
      setShowForm(false);
      setTitle(''); setDesc(''); setDate(''); setLocationName(''); setRouteId(''); setInvited([]);
      router.push(`/events/${ev.id}`);
    } catch (err) {
      alert(err.message || 'Errore');
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();
  const visibleEvents = events.filter((e) => {
    if (tab === 'mine') return currentUser && e.host_id === currentUser.id;
    if (tab === 'invites') return currentUser && e.host_id !== currentUser.id && (e.invited || []).includes(currentUser.id);
    return new Date(e.date).getTime() >= now - 6 * 3600 * 1000; // prossimi
  });

  const openCreate = () => {
    if (!currentUser) { router.push('/auth'); return; }
    setShowForm(true);
  };

  if (!loading && !currentUser) {
    return <RequireAuth feature="gli eventi" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={30} color="var(--primary)" /> Eventi & Date 🍻
          </h1>
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: '15px', marginTop: '4px' }}>
            Organizza bevute, invita gli amici e gestisci gli itinerari come una vera squadra.
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary" style={{ borderRadius: '20px' }}>
          <Plus size={16} /> Crea Evento
        </button>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        {[
          { key: 'upcoming', label: 'In programma' },
          { key: 'mine', label: 'I miei eventi' },
          { key: 'invites', label: 'Inviti ricevuti' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '20px' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista eventi */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dark-secondary)' }}>Carico gli eventi...</div>
      ) : visibleEvents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '44px' }}>
          <Calendar size={36} color="var(--text-dark-secondary)" style={{ marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-dark-secondary)', marginBottom: '18px' }}>
            {tab === 'invites' ? 'Nessun invito ricevuto al momento.' : tab === 'mine' ? 'Non hai ancora creato eventi.' : 'Nessun evento in programma. Sii tu a organizzare il prossimo giro!'}
          </p>
          <button onClick={openCreate} className="btn btn-primary"><Plus size={16} /> Crea il primo evento</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {visibleEvents.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>{ev.title}</h3>
                {ev.myResponse && (
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: '20px', flexShrink: 0,
                    background: ev.myResponse === 'going' ? 'rgba(16,185,129,0.15)' : ev.myResponse === 'maybe' ? 'rgba(223, 255, 0,0.15)' : 'rgba(239,68,68,0.15)',
                    color: ev.myResponse === 'going' ? 'var(--success)' : ev.myResponse === 'maybe' ? 'var(--secondary)' : 'var(--error)' }}>
                    {RSVP_LABEL[ev.myResponse]}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>
                <Clock size={14} /> {formatEventDate(ev.date)}
              </div>

              {ev.location_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                  <MapPin size={14} /> {ev.location_name}
                </div>
              )}
              {ev.route_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                  <RouteIcon size={14} /> {ev.route_name}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-dark)', paddingTop: '10px', marginTop: 'auto' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Crown size={13} color="var(--secondary)" /> {ev.host?.display_name || ev.host_name}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Users size={13} /> {ev.goingCount} partecipano
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* MODALE CREA EVENTO */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: '560px', border: '2px solid var(--primary)', marginTop: '30px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarPlus size={20} color="var(--primary)" /> Nuovo Evento
              </h2>
              <button onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '34px', height: '34px' }}><X size={16} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Titolo</label>
              <input className="form-control" placeholder="es. Pub Crawl del Sabato" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data e ora</label>
                <input type="datetime-local" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Luogo di ritrovo</label>
                <input className="form-control" placeholder="es. Rialto, Venezia" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Itinerario collegato (opzionale)</label>
              <select className="form-control" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">Nessun itinerario</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descrizione</label>
              <textarea className="form-control" rows={2} placeholder="Dettagli, dress code, cosa portare..." value={desc} onChange={(e) => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Invita amici ({invited.length} selezionati)</label>
              {following.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
                  Segui altri atleti dal <Link href="/profile" style={{ color: 'var(--primary)' }}>tuo profilo</Link> per poterli invitare.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                  {following.map((f) => {
                    const sel = invited.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleInvite(f.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px',
                          border: `1px solid ${sel ? 'var(--primary)' : 'var(--border-dark)'}`,
                          background: sel ? 'rgba(255, 32, 0,0.12)' : 'var(--bg-input-dark)',
                          color: sel ? 'var(--primary)' : 'var(--text-dark-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                        }}
                      >
                        {sel && <Check size={13} />}
                        {f.display_name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={handleCreate} disabled={saving} className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }}>
              {saving ? 'Creo evento...' : 'Crea e invita'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
