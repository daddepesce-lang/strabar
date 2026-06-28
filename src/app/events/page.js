'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
  Calendar, Plus, MapPin, Users, Clock, X, Check,
  CalendarPlus, Route as RouteIcon, Crown, Loader,
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming'); // upcoming | mine | invites

  // Form di creazione
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [visibility, setVisibility] = useState('public'); // chi lo vede nella LISTA: public | friends | private
  const [linkSharing, setLinkSharing] = useState(true); // il LINK di invito funziona (chiunque lo riceve entra)
  const [invited, setInvited] = useState([]);
  const [invitedPeople, setInvitedPeople] = useState([]); // [{id,name,username}] mostrati come chip
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selettore luogo: cerca locali/indirizzi reali (OSM) oppure usa testo libero.
  const [locQuery, setLocQuery] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locSearching, setLocSearching] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null); // { name, lat, lng } se reale; null se testo libero

  const load = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      const [evs, rts] = await Promise.all([db.getEvents(), db.getRoutes()]);
      setEvents(evs);
      setRoutes(rts);
    } catch (err) {
      console.error('Errore caricamento eventi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addInvitee = (p) => {
    setInvited((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setInvitedPeople((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setInviteQuery(''); setInviteResults([]);
  };
  const removeInvitee = (id) => {
    setInvited((prev) => prev.filter((i) => i !== id));
    setInvitedPeople((prev) => prev.filter((x) => x.id !== id));
  };

  // Preselezione amico da invitare via ?invite=<id>: carica solo QUEL profilo (no lista intera).
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (!inviteId) return;
    setShowForm(true);
    if (typeof db.getUserProfile === 'function') {
      db.getUserProfile(inviteId).then((p) => {
        if (p) addInvitee({ id: p.id, name: p.display_name || p.username || 'Atleta', username: p.username || null });
      }).catch(() => setInvited((prev) => (prev.includes(inviteId) ? prev : [...prev, inviteId])));
    } else {
      setInvited((prev) => (prev.includes(inviteId) ? prev : [...prev, inviteId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Ricerca persone da invitare (server-side, debounced): NON carica tutti i seguiti, così
  // regge anche con migliaia di contatti. Cerca per nome o @username.
  useEffect(() => {
    const q = inviteQuery.trim();
    if (q.length < 2) { setInviteResults([]); setInviteSearching(false); return; }
    setInviteSearching(true);
    const h = setTimeout(async () => {
      try {
        const res = (typeof db.searchProfiles === 'function') ? await db.searchProfiles(q) : [];
        setInviteResults((res || []).filter((p) => p.id !== currentUser?.id).slice(0, 8));
      } catch { setInviteResults([]); }
      finally { setInviteSearching(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [inviteQuery, currentUser]);

  // Ricerca luoghi (locali, vie, indirizzi) su OpenStreetMap mentre l'utente scrive.
  useEffect(() => {
    const q = locQuery.trim();
    // Se il testo coincide col luogo già selezionato, non ricercare di nuovo.
    if (q.length < 2 || (selectedLoc && selectedLoc.name === q)) {
      setLocResults([]); setLocSearching(false);
      return;
    }
    setLocSearching(true);
    const h = setTimeout(async () => {
      try {
        const res = await db.searchVenues(q);
        setLocResults((res || []).slice(0, 8));
      } catch {
        setLocResults([]);
      } finally {
        setLocSearching(false);
      }
    }, 450);
    return () => clearTimeout(h);
  }, [locQuery, selectedLoc]);

  const pickLocation = (v) => {
    setSelectedLoc({ name: v.name, lat: v.lat, lng: v.lng });
    setLocationName(v.name);
    setLocQuery(v.name);
    setLocResults([]);
  };

  const useFreeTextLocation = () => {
    const t = locQuery.trim();
    if (!t) return;
    setSelectedLoc(null); // testo libero, senza coordinate
    setLocationName(t);
    setLocResults([]);
  };

  const handleCreate = async () => {
    if (!title.trim()) { alert('Dai un titolo al tuo evento!'); return; }
    if (!date) { alert('Scegli una data e un orario!'); return; }
    setSaving(true);
    try {
      const selectedRoute = routes.find((r) => r.id === routeId);
      const finalLocName = (selectedLoc?.name || locationName || locQuery).trim();
      const ev = await db.createEvent({
        title, description: desc, date,
        location_name: finalLocName,
        location: selectedLoc && selectedLoc.lat != null ? selectedLoc : null,
        route_id: routeId || null,
        route_name: selectedRoute?.name || null,
        visibility,
        link_sharing: linkSharing,
        invited,
      });
      setShowForm(false);
      setTitle(''); setDesc(''); setDate(''); setLocationName(''); setRouteId(''); setVisibility('public'); setLinkSharing(true); setInvited([]); setInvitedPeople([]); setInviteQuery('');
      setLocQuery(''); setLocResults([]); setSelectedLoc(null);
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
            <Link key={ev.id} href={`/events/${ev.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...(ev.isSponsored ? { border: '1px solid var(--secondary)' } : {}) }}>
              {ev.isSponsored && (
                <span style={{ alignSelf: 'flex-start', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', padding: '3px 8px', borderRadius: '20px', background: 'rgba(223, 255, 0,0.16)', color: 'var(--secondary)', border: '1px solid rgba(223,255,0,0.35)' }}>
                  ⭐ Sponsorizzato
                </span>
              )}
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
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Luogo di ritrovo</label>
                <input
                  className="form-control"
                  placeholder="Cerca un locale, una via o scrivi libero…"
                  value={locQuery}
                  onChange={(e) => { setLocQuery(e.target.value); setSelectedLoc(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); useFreeTextLocation(); } }}
                />
                {/* Conferma selezione corrente */}
                {locationName && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-dark-secondary)' }}>
                    Luogo scelto: <strong style={{ color: 'var(--primary)' }}>{locationName}</strong>
                    {selectedLoc?.lat != null ? ' 📍 (posizione reale)' : ' ✍️ (testo libero)'}
                  </div>
                )}
                {/* Risultati ricerca */}
                {(locSearching || locResults.length > 0 || locQuery.trim().length >= 2) && (locQuery.trim() !== locationName || locResults.length > 0) && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card-dark, #1a1d2e)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {locSearching && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cerco luoghi…
                      </div>
                    )}
                    {locResults.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickLocation(v)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'block', fontSize: '13px', color: '#FFF', fontWeight: 600 }}>
                          <MapPin size={11} style={{ marginRight: '4px', color: 'var(--primary)' }} />{v.name}
                        </span>
                        {v.address && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.address}</span>}
                      </button>
                    ))}
                    {!locSearching && locQuery.trim().length >= 2 && (
                      <button
                        type="button"
                        onClick={useFreeTextLocation}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-dark-secondary)' }}
                      >
                        ✍️ Usa &quot;<strong style={{ color: 'var(--primary)' }}>{locQuery.trim()}</strong>&quot; come testo libero
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Itinerario collegato (opzionale)</label>
              {(() => {
                // Collegabili: solo i MIEI itinerari (qualunque privacy) o quelli PUBBLICI.
                // Un tour "amici" di un altro non si può collegare: l'evento potrebbe avere
                // un pubblico più ampio del tour → si eviterebbe un leak.
                const selectable = routes.filter((r) => r.user_id === currentUser?.id || r.visibility === 'public');
                const sel = routes.find((r) => r.id === routeId);
                const mineNonPublic = sel && sel.user_id === currentUser?.id && (sel.visibility || 'public') !== 'public';
                return (
                  <>
                    <select className="form-control" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                      <option value="">Nessun itinerario</option>
                      {selectable.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.user_id === currentUser?.id ? ' · il mio' : ' · pubblico'}{(r.user_id === currentUser?.id && (r.visibility || 'public') !== 'public') ? (r.visibility === 'private' ? ' 🔒' : ' 👥') : ''}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                      Puoi collegare i <strong>tuoi</strong> itinerari o quelli <strong>pubblici</strong>.
                      {mineNonPublic && (
                        <> <br />⚠️ <span style={{ color: 'var(--secondary)' }}>Questo è un tuo itinerario {sel.visibility === 'private' ? 'privato' : 'riservato agli amici'}: collegandolo, le sue tappe saranno visibili <strong>dentro l&apos;evento</strong> a chi può vederlo (secondo la privacy dell&apos;evento). Resta comunque fuori dalla lista pubblica dei tour.</span></>
                      )}
                    </p>
                  </>
                );
              })()}
            </div>

            <div className="form-group">
              <label className="form-label">Descrizione</label>
              <textarea className="form-control" rows={2} placeholder="Dettagli, dress code, cosa portare..." value={desc} onChange={(e) => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Invita amici ({invited.length} selezionati)</label>

              {/* Persone già selezionate (chip rimovibili) */}
              {invitedPeople.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {invitedPeople.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => removeInvitee(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--primary)', background: 'rgba(255, 32, 0,0.12)', color: 'var(--primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                    >
                      <Check size={13} /> {p.name} <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* Ricerca persone (server-side): niente caricamento di tutta la lista */}
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  placeholder="Cerca per nome o @username…"
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                />
                {(inviteSearching || inviteResults.length > 0) && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card-dark, #1a1d2e)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: '220px', overflowY: 'auto' }}>
                    {inviteSearching && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cerco atleti…
                      </div>
                    )}
                    {inviteResults.map((p) => {
                      const sel = invited.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => (sel ? removeInvitee(p.id) : addInvitee({ id: p.id, name: p.display_name || p.username || 'Atleta', username: p.username || null }))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', textAlign: 'left', padding: '9px 12px', background: sel ? 'rgba(255,32,0,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer' }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '13px', color: '#FFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name || p.username}</span>
                            {p.username && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>}
                          </span>
                          {sel ? <Check size={15} color="var(--primary)" /> : <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>+ Invita</span>}
                        </button>
                      );
                    })}
                    {!inviteSearching && inviteResults.length === 0 && inviteQuery.trim().length >= 2 && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Nessun atleta trovato.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ACCESSO — due concetti distinti e indipendenti */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
              <label className="form-label">Rendi visibile a:</label>
              <div className="seg-tabs" style={{ display: 'flex', gap: '6px' }}>
                {[
                  { v: 'public', t: '🌍 Tutti' },
                  { v: 'friends', t: '👥 Amici' },
                  { v: 'private', t: '🔒 Nessuno' },
                ].map((o) => (
                  <div
                    key={o.v}
                    onClick={() => setVisibility(o.v)}
                    style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '9px 4px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', border: visibility === o.v ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: visibility === o.v ? 'var(--primary)' : 'var(--text-dark-primary)', background: 'var(--bg-input-dark)' }}
                  >{o.t}</div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {visibility === 'public'
                  ? '🌍 Compare nella lista eventi a tutti gli utenti.'
                  : visibility === 'friends'
                  ? '👥 Compare nella lista solo ai tuoi amici (chi segui / ti segue).'
                  : '🔒 Non compare nella lista a nessuno: lo vedono solo tu e le persone che inviti.'}
              </p>
            </div>

            <div className="form-group">
              <label
                onClick={() => setLinkSharing((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer' }}
              >
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px' }}>🔗 Link di invito</span>
                <span style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0, transition: 'var(--transition)', background: linkSharing ? 'var(--primary)' : 'var(--border-dark)' }}>
                  <span style={{ position: 'absolute', top: '2px', left: linkSharing ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'var(--transition)' }} />
                </span>
              </label>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {linkSharing
                  ? '✅ Chiunque riceva il link può aprire e partecipare — anche senza account e anche se non lo vede nella lista. Perfetto per invitare non-amici.'
                  : '⛔ Solo tu e le persone che inviti per nome potete accedere. Un link inoltrato non funzionerà.'}
              </p>
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
