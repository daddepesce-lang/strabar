'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
  ArrowLeft, Calendar, MapPin, Users, Crown, Check, HelpCircle, X,
  Route as RouteIcon, Trash2, UserPlus, ExternalLink, Share2, MessageCircle,
  Edit3, Loader, Beer,
} from 'lucide-react';

function formatEventDate(ds) {
  if (!ds) return 'Data da definire';
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ISO (UTC) → stringa per <input type="datetime-local"> in ORA LOCALE (no shift di fuso).
function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Posizione GPS corrente (null se non disponibile).
const getPosition = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    const ok = (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
    navigator.geolocation.getCurrentPosition(
      ok,
      () => navigator.geolocation.getCurrentPosition(ok, () => resolve(null), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );
  });

const RSVP = [
  { key: 'going', label: 'Partecipo', icon: Check, color: 'var(--success)' },
  { key: 'maybe', label: 'Forse', icon: HelpCircle, color: 'var(--secondary)' },
  { key: 'no', label: 'Non posso', icon: X, color: 'var(--error)' },
];

export default function EventDetailPage({ params }) {
  const router = useRouter();
  const { id } = use(params);

  const [currentUser, setCurrentUser] = useState(null);
  const [event, setEvent] = useState(null);
  const [following, setFollowing] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [toInvite, setToInvite] = useState([]);
  const [copied, setCopied] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [responding, setResponding] = useState(false);
  const [eventShare, setEventShare] = useState('public'); // privacy della sessione avviata dall'evento

  // Modifica evento (solo organizzatore)
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [edit, setEdit] = useState({ title: '', description: '', date: '', routeId: '' });
  const [locQuery, setLocQuery] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locSearching, setLocSearching] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null); // { name, lat, lng } se reale; null = testo libero
  const [editLocName, setEditLocName] = useState('');
  const [board, setBoard] = useState(null); // classifica + statistiche dell'evento

  const load = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      const ev = await db.getEvent(id);
      setEvent(ev);
      if (user) {
        const [fol, rts] = await Promise.all([db.getFollowing(user.id), db.getRoutes()]);
        setFollowing(fol);
        setRoutes(rts);
      }
      // Classifica/statistiche dell'evento (nomi coperti per i non-amici, privacy globale)
      try { setBoard(await db.getEventBoard(id, user?.id)); } catch { setBoard(null); }
    } catch (err) {
      console.error('Errore caricamento evento:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ricerca luoghi (locali, vie, indirizzi) durante la modifica
  useEffect(() => {
    const q = locQuery.trim();
    if (!showEdit || q.length < 2 || (selectedLoc && selectedLoc.name === q) || q === editLocName) {
      setLocResults([]); setLocSearching(false);
      return;
    }
    setLocSearching(true);
    const h = setTimeout(async () => {
      try { setLocResults((await db.searchVenues(q) || []).slice(0, 8)); }
      catch { setLocResults([]); }
      finally { setLocSearching(false); }
    }, 450);
    return () => clearTimeout(h);
  }, [locQuery, selectedLoc, showEdit, editLocName]);

  const openEdit = () => {
    setEdit({
      title: event.title || '',
      description: event.description || '',
      date: event.date ? toLocalInput(event.date) : '',
      routeId: event.route_id || '',
    });
    setEditLocName(event.location_name || '');
    setLocQuery(event.location_name || '');
    setSelectedLoc(event.location && event.location.lat != null ? event.location : null);
    setLocResults([]);
    setShowEdit(true);
  };

  const pickLocation = (v) => {
    setSelectedLoc({ name: v.name, lat: v.lat, lng: v.lng });
    setEditLocName(v.name);
    setLocQuery(v.name);
    setLocResults([]);
  };
  const useFreeTextLocation = () => {
    const t = locQuery.trim();
    if (!t) return;
    setSelectedLoc(null);
    setEditLocName(t);
    setLocResults([]);
  };

  const handleSaveEdit = async () => {
    if (!edit.title.trim()) { alert('Il titolo non può essere vuoto.'); return; }
    if (!edit.date) { alert('Scegli data e ora.'); return; }
    setSavingEdit(true);
    try {
      const selectedRoute = routes.find((r) => r.id === edit.routeId);
      const finalLocName = (selectedLoc?.name || editLocName || locQuery).trim();
      await db.updateEvent(id, {
        title: edit.title.trim(),
        description: edit.description,
        date: new Date(edit.date).toISOString(),
        location_name: finalLocName,
        location: selectedLoc && selectedLoc.lat != null ? selectedLoc : null,
        route_id: edit.routeId || null,
        route_name: selectedRoute?.name || null,
      });
      setShowEdit(false);
      await load();
    } catch (err) {
      alert(err.message || 'Errore nel salvataggio');
    } finally {
      setSavingEdit(false);
    }
  };

  // Avvia una sessione live pre-compilata con luogo dell'evento e amici pre-taggati
  const handleStartEventSession = async () => {
    if (!currentUser) { router.push('/auth'); return; }
    setStartingSession(true);
    try {
      const active = await db.getActiveSession(currentUser.id);
      if (active) {
        alert('Hai già una sessione live attiva. Chiudila prima di iniziarne una nuova.');
        setStartingSession(false);
        return;
      }
      // Compagni = chi partecipa ("going"), escluso me, pre-taggati come "Nome (@username)"
      const companions = (event.responses || [])
        .filter((r) => r.status === 'going' && r.user_id !== currentUser.id)
        .map((r) => {
          const dn = r.profile?.display_name || r.user_name || 'Atleta';
          const un = r.profile?.username;
          return un ? `${dn} (@${un})` : dn;
        });
      // Verifica GPS rispetto al luogo dell'evento (se ha coordinate): se sei lontano,
      // avvisa e segna "non verificata" (non conta per le classifiche del locale).
      const hasCoords = event.location && event.location.lat != null;
      let unverified = false;
      if (hasCoords) {
        const pos = await getPosition();
        if (!pos) {
          if (!window.confirm('GPS non disponibile: la sessione non conterà per le classifiche del locale. Procedere?')) { setStartingSession(false); return; }
          unverified = true;
        } else {
          const { distance } = db.checkGeofencing(event.location.lat, event.location.lng, pos.lat, pos.lng, Infinity);
          if (distance > 300) {
            const d = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
            if (!window.confirm(`Sei a circa ${d} dal luogo dell'evento.\nLa sessione verrà segnata "non verificata". Procedere?`)) { setStartingSession(false); return; }
            unverified = true;
          }
        }
      }
      // La sessione viene "legata" all'evento (event_id) — e al percorso se presente —
      // così la classifica/statistiche dell'evento sa quali sessioni contare.
      const loc = {
        ...(hasCoords
          ? { name: event.location.name, lat: event.location.lat, lng: event.location.lng, ...(unverified ? { unverified: true } : {}) }
          : (event.location_name ? { name: event.location_name } : {})),
        share: eventShare,
        event_id: event.id,
        event_title: event.title,
        ...(event.route_id ? { route_id: event.route_id, route_name: event.route_name || null } : {}),
      };
      await db.createActivity({
        title: `Brindisi · ${event.title}`,
        location: loc,
        drank_with: companions,
        drinks: [],
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1,
      });
      router.push('/');
    } catch (err) {
      alert('Errore nell\'avvio della sessione: ' + (err.message || err));
      setStartingSession(false);
    }
  };

  const respond = async (status) => {
    if (!currentUser) { router.push('/auth'); return; }
    if (responding) return;                    // evita doppi invii ravvicinati
    if (event?.myResponse === status) return;  // stessa risposta → niente da fare
    setResponding(true);
    try {
      await db.respondToEvent(id, status);
      await load();
    } catch (err) {
      alert(err.message || 'Errore');
    } finally {
      setResponding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Vuoi davvero eliminare questo evento?')) return;
    await db.deleteEvent(id);
    router.push('/events');
  };

  const shareText = () => {
    const d = event?.date ? formatEventDate(event.date) : '';
    return `🍻 ${event?.title || 'Evento Strabar'}\n📅 ${d}${event?.location_name ? `\n📍 ${event.location_name}` : ''}\n\nUnisciti a me su Strabar! ${window.location.href}`;
  };

  const shareEvent = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event?.title, text: shareText() });
        return;
      } catch { /* utente ha annullato */ }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener,noreferrer');
  };

  const sendInvites = async () => {
    if (toInvite.length === 0) { setShowInvite(false); return; }
    await db.inviteToEvent(id, toInvite);
    setToInvite([]);
    setShowInvite(false);
    await load();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="pulse" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 'bold' }}>Carico l&apos;evento... 🍻</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Evento non trovato</h2>
        <Link href="/events" className="btn btn-primary">Torna agli eventi</Link>
      </div>
    );
  }

  const isHost = currentUser && currentUser.id === event.host_id;
  const grouped = { going: [], maybe: [], no: [] };
  (event.responses || []).forEach((r) => { if (grouped[r.status]) grouped[r.status].push(r); });
  const alreadyInvolved = new Set((event.responses || []).map((r) => r.user_id).concat(event.invited || []));
  const invitable = following.filter((f) => !alreadyInvolved.has(f.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Link href="/events" className="action-btn" style={{ fontSize: '14px', width: 'fit-content' }}>
        <ArrowLeft size={16} /> Tutti gli eventi
      </Link>

      {/* Intestazione evento */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.06) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>{event.title}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={shareWhatsApp} className="btn" style={{ padding: '8px 14px', fontSize: '13px', background: '#25D366', color: '#fff', fontWeight: 700 }}>
              <MessageCircle size={15} /> WhatsApp
            </button>
            <button onClick={shareEvent} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', color: copied ? 'var(--success)' : 'var(--text-dark-primary)' }}>
              <Share2 size={15} /> {copied ? 'Link copiato!' : 'Condividi'}
            </button>
            {isHost && (
              <button onClick={openEdit} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
                <Edit3 size={15} /> Modifica
              </button>
            )}
            {isHost && (
              <button onClick={handleDelete} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', color: 'var(--error)' }}>
                <Trash2 size={15} /> Elimina
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--primary)', fontWeight: 600 }}>
            <Calendar size={16} /> {formatEventDate(event.date)}
          </div>
          {event.location_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
              <MapPin size={16} /> {event.location_name}
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location_name)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px' }}>
                <ExternalLink size={12} /> Mappa
              </a>
            </div>
          )}
          {event.route_name && (
            <Link href="/routes" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
              <RouteIcon size={16} /> Itinerario: <strong style={{ color: 'var(--primary)' }}>{event.route_name}</strong>
            </Link>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
            <Crown size={16} color="var(--secondary)" /> Organizzato da{' '}
            <Link href={`/u/${event.host_id}`} style={{ color: '#FFF', fontWeight: 600 }}>{event.host?.display_name || event.host_name}</Link>
          </div>
        </div>

        {event.description && (
          <p style={{ marginTop: '14px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderLeft: '3px solid var(--primary)', borderRadius: '8px', fontSize: '15px', lineHeight: 1.5 }}>
            {event.description}
          </p>
        )}
      </div>

      {/* RSVP */}
      <div className="card">
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Ci sarai?</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {RSVP.map(({ key, label, icon: Icon, color }) => {
            const active = event.myResponse === key;
            return (
              <button
                key={key}
                onClick={() => respond(key)}
                disabled={responding}
                className="btn"
                style={{
                  flex: '1 1 120px', borderRadius: '12px', padding: '12px',
                  border: `1px solid ${active ? color : 'var(--border-dark)'}`,
                  background: active ? color : 'var(--bg-input-dark)',
                  color: active ? '#0D0D0D' : 'var(--text-dark-primary)',
                  fontWeight: 700,
                  opacity: responding && !active ? 0.6 : 1,
                  cursor: responding ? 'default' : 'pointer',
                }}
              >
                <Icon size={16} /> {label}
              </button>
            );
          })}
        </div>

        {/* Avvia una sessione live pre-compilata per questo evento */}
        {currentUser && (isHost || event.isInvited || event.myResponse) && (
          <>
            <div style={{ marginTop: '14px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '6px' }}>Chi vede la tua sessione?</span>
              <div className="seg-tabs">
                <div className={`seg-tab ${eventShare === 'public' ? 'active' : ''}`} onClick={() => setEventShare('public')}>🌍 Tutti</div>
                <div className={`seg-tab ${eventShare === 'friends' ? 'active' : ''}`} onClick={() => setEventShare('friends')}>👥 Amici</div>
                <div className={`seg-tab ${eventShare === 'private' ? 'active' : ''}`} onClick={() => setEventShare('private')}>🔒 Nessuno</div>
              </div>
            </div>
            <button
              onClick={handleStartEventSession}
              disabled={startingSession}
              className="btn btn-primary"
              style={{ width: '100%', borderRadius: '14px', padding: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {startingSession ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Beer size={16} />}
              Registra brindisi all&apos;evento
            </button>
          </>
        )}
        {currentUser && (isHost || event.isInvited || event.myResponse) && (
          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '6px' }}>
            Avvia una sessione live già con il luogo dell&apos;evento e i partecipanti pre-taggati.
          </p>
        )}
      </div>

      {/* Classifica + statistiche dell'evento */}
      {board && board.participants > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Crown size={18} color="var(--secondary)" /> Classifica dell&apos;evento
            {board.routeName && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dark-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <RouteIcon size={13} /> {board.routeName}
              </span>
            )}
          </h3>

          {/* Statistiche aggregate */}
          <div className="r-grid-stat-4" style={{ background: 'rgba(255,32,0,0.04)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,32,0,0.15)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Partecipanti</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{board.participants}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>U.A. totali</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFF', marginTop: '4px' }}>{board.totalUnits}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Drink</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFF', marginTop: '4px' }}>{board.totalDrinks}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-dark)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Media U.A.</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--secondary)', marginTop: '4px' }}>{board.avgUnits}</div>
            </div>
          </div>
          {board.activeNow > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--success)', margin: 0, fontWeight: 600 }}>🔴 {board.activeNow} live in corso adesso</p>
          )}

          {/* Classifica per U.A. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {board.board.map((u, i) => {
              const row = (
                <>
                  <span style={{ width: 26, textAlign: 'center', fontWeight: 800, color: i === 0 ? 'var(--secondary)' : 'var(--text-dark-secondary)', flexShrink: 0 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                  <div className="activity-avatar" style={{ width: 32, height: 32, fontSize: 14, flexShrink: 0 }}>
                    {u.revealed ? (u.name || 'U').charAt(0) : '🥷'}
                  </div>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '14px', color: u.revealed ? '#FFF' : 'var(--text-dark-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', flexShrink: 0 }}>{u.drinks} drink</span>
                  <strong style={{ fontSize: '15px', color: 'var(--primary)', flexShrink: 0, minWidth: 54, textAlign: 'right' }}>{u.units} U.A.</strong>
                </>
              );
              return u.revealed ? (
                <Link key={u.user_id} href={`/u/${u.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', background: 'var(--bg-input-dark)' }}>{row}</Link>
              ) : (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '10px', background: 'var(--bg-input-dark)' }}>{row}</div>
              );
            })}
          </div>

          {/* Top BAC */}
          {board.topBac.length > 0 && board.topBac[0].bac > 0 && (
            <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase' }}>🥴 Picco tasso alcolico</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {board.topBac.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: t.revealed ? '#FFF' : 'var(--text-dark-secondary)' }}>{t.revealed ? '' : '🥷 '}{t.name}</span>
                    <strong style={{ color: 'var(--secondary)' }}>{t.bac.toFixed(2)} g/L</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
            🔒 Contano le sessioni avviate da questo evento. Il nome è visibile solo per te e per chi segui o ti segue; gli altri restano coperti.
          </p>
        </div>
      )}

      {/* Partecipanti */}
      <div className="r-grid-2">
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} color="var(--success)" /> Partecipano ({grouped.going.length})
          </h3>
          <AttendeeList list={grouped.going} emptyText="Nessun partecipante confermato ancora." />
          {grouped.maybe.length > 0 && (
            <>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '16px 0 10px', color: 'var(--secondary)' }}>Forse ({grouped.maybe.length})</h4>
              <AttendeeList list={grouped.maybe} />
            </>
          )}
          {grouped.no.length > 0 && (
            <>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '16px 0 10px', color: 'var(--error)' }}>Non possono ({grouped.no.length})</h4>
              <AttendeeList list={grouped.no} />
            </>
          )}
        </div>

        {/* Inviti */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="var(--primary)" /> Invitati ({(event.invited || []).length})
            </h3>
            {isHost && (
              <button onClick={() => setShowInvite((s) => !s)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                {showInvite ? 'Chiudi' : 'Invita amici'}
              </button>
            )}
          </div>

          {showInvite && (
            invitable.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>
                Hai già coinvolto tutti i tuoi amici, oppure non segui ancora nessuno da invitare.
              </p>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                  {invitable.map((f) => {
                    const sel = toInvite.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => setToInvite((p) => sel ? p.filter((i) => i !== f.id) : [...p, f.id])}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px',
                          border: `1px solid ${sel ? 'var(--primary)' : 'var(--border-dark)'}`,
                          background: sel ? 'rgba(255, 32, 0,0.12)' : 'var(--bg-input-dark)',
                          color: sel ? 'var(--primary)' : 'var(--text-dark-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                        {sel && <Check size={13} />}{f.display_name}
                      </button>
                    );
                  })}
                </div>
                <button onClick={sendInvites} className="btn btn-primary" style={{ width: '100%', fontSize: '13px' }}>
                  Invia {toInvite.length > 0 ? `(${toInvite.length})` : ''} inviti
                </button>
              </div>
            )
          )}

          {(event.invited || []).length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Nessun invitato. Usa &quot;Invita amici&quot; per coinvolgere il gruppo.</p>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>
              {(event.invited || []).length} persone invitate • {grouped.going.length} hanno confermato.
            </p>
          )}
        </div>
      </div>

      {/* MODALE MODIFICA EVENTO (solo organizzatore) */}
      {showEdit && (
        <div
          onClick={() => setShowEdit(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: '560px', border: '2px solid var(--primary)', marginTop: '30px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} color="var(--primary)" /> Modifica Evento
              </h2>
              <button onClick={() => setShowEdit(false)} className="btn btn-secondary" style={{ padding: '4px 10px', borderRadius: '50%', minWidth: '34px', height: '34px' }}><X size={16} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Titolo</label>
              <input className="form-control" value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data e ora</label>
                <input type="datetime-local" className="form-control" value={edit.date} onChange={(e) => setEdit((p) => ({ ...p, date: e.target.value }))} />
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
                {editLocName && (
                  <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-dark-secondary)' }}>
                    Luogo: <strong style={{ color: 'var(--primary)' }}>{editLocName}</strong>
                    {selectedLoc?.lat != null ? ' 📍 (reale)' : ' ✍️ (libero)'}
                  </div>
                )}
                {(locSearching || locResults.length > 0) && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card-dark, #1a1d2e)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {locSearching && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cerco luoghi…
                      </div>
                    )}
                    {locResults.map((v, i) => (
                      <button key={i} type="button" onClick={() => pickLocation(v)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: 'pointer' }}>
                        <span style={{ display: 'block', fontSize: '13px', color: '#FFF', fontWeight: 600 }}>
                          <MapPin size={11} style={{ marginRight: '4px', color: 'var(--primary)' }} />{v.name}
                        </span>
                        {v.address && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.address}</span>}
                      </button>
                    ))}
                    {!locSearching && locQuery.trim().length >= 2 && (
                      <button type="button" onClick={useFreeTextLocation} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>
                        ✍️ Usa &quot;<strong style={{ color: 'var(--primary)' }}>{locQuery.trim()}</strong>&quot; come testo libero
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Itinerario collegato (opzionale)</label>
              <select className="form-control" value={edit.routeId} onChange={(e) => setEdit((p) => ({ ...p, routeId: e.target.value }))}>
                <option value="">Nessun itinerario</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Descrizione</label>
              <textarea className="form-control" rows={2} value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>

            <button onClick={handleSaveEdit} disabled={savingEdit} className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }}>
              {savingEdit ? 'Salvo...' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AttendeeList({ list, emptyText }) {
  if (!list || list.length === 0) {
    return emptyText ? <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{emptyText}</p> : null;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {list.map((r) => (
        <Link key={r.user_id} href={`/u/${r.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-input-dark)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
          <div className="activity-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
            {(r.profile?.display_name || r.user_name || 'U').charAt(0)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{r.profile?.display_name || r.user_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{r.profile?.username || 'utente'}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
