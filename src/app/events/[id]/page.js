'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import {
  ArrowLeft, Calendar, MapPin, Users, Crown, Check, HelpCircle, X,
  Route as RouteIcon, Trash2, UserPlus, ExternalLink, Share2, MessageCircle,
  Edit3, Loader, Beer, Search,
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
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [toInvite, setToInvite] = useState([]);
  const [invitePeople, setInvitePeople] = useState([]); // [{id,name,username}] selezionati
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [responding, setResponding] = useState(false);
  const [eventShare, setEventShare] = useState('public'); // privacy della sessione avviata dall'evento

  // Modifica evento (solo organizzatore)
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [edit, setEdit] = useState({ title: '', description: '', date: '', routeId: '', visibility: 'public', linkSharing: true });
  const [locQuery, setLocQuery] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locSearching, setLocSearching] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null); // { name, lat, lng } se reale; null = testo libero
  const [editLocName, setEditLocName] = useState('');
  const [board, setBoard] = useState(null); // classifica + statistiche dell'evento
  const [now, setNow] = useState(0); // orologio (per la finestra di avvio "2 ore prima")

  // Aggiorna l'orologio: così il pulsante si abilita da solo quando si apre la finestra.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Token del link di condivisione (?t=...): chi ce l'ha è "invitato" e può vedere/partecipare
  // anche senza account o senza essere amico.
  const shareToken = (typeof window !== 'undefined')
    ? new URLSearchParams(window.location.search).get('t')
    : null;

  const load = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      const ev = await db.getEventShared(id, shareToken);
      setEvent(ev);
      if (user) {
        const rts = await db.getRoutes();
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

  // Ricerca persone da invitare (server-side, debounced): niente caricamento di tutti i seguiti.
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
      visibility: event.visibility || 'public',
      linkSharing: event.link_sharing !== false,
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
        visibility: edit.visibility || 'public',
        link_sharing: edit.linkSharing !== false,
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
  // Avvio consentito solo da 2 ore prima dell'inizio (guardia anche lato logica, non solo UI).
  const startWindowClosed = () => {
    const ms = event?.date ? new Date(event.date).getTime() : null;
    if (ms == null || isNaN(ms)) return false;
    if (Date.now() < ms - 2 * 60 * 60 * 1000) {
      alert('Potrai avviare il brindisi/tour solo a partire da 2 ore prima dell\'inizio dell\'evento.');
      return true;
    }
    return false;
  };

  const handleStartEventSession = async () => {
    if (!currentUser) { router.push('/auth'); return; }
    if (startWindowClosed()) return;
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

  // Se l'evento ha un itinerario collegato, avvia un TOUR GUIDATO (come dalla pagina percorsi)
  // ma "legato" all'evento (event_id), così la live parte sulla prima tappa con le indicazioni
  // e la sessione conta comunque per la classifica dell'evento.
  const handleStartEventTour = async () => {
    if (!currentUser) { router.push('/auth'); return; }
    if (startWindowClosed()) return;
    setStartingSession(true);
    try {
      const active = await db.getActiveSession(currentUser.id);
      if (active) {
        alert('Hai già una sessione live attiva. Chiudila prima di iniziarne una nuova.');
        setStartingSession(false);
        return;
      }
      const route = await db.getRoute(event.route_id);
      const stopsRaw = route?.waypoints || [];
      if (stopsRaw.length === 0) {
        alert('L\'itinerario collegato non ha tappe: avvia un brindisi semplice.');
        setStartingSession(false);
        return;
      }
      const stops = stopsRaw.map((w) => ({ name: w.name, lat: w.lat, lng: w.lng ?? w.lon, note: w.note || '' }));
      const first = stops[0];
      // Compagni = chi partecipa ("going"), escluso me, pre-taggati come "Nome (@username)"
      const companions = (event.responses || [])
        .filter((r) => r.status === 'going' && r.user_id !== currentUser.id)
        .map((r) => {
          const dn = r.profile?.display_name || r.user_name || 'Atleta';
          const un = r.profile?.username;
          return un ? `${dn} (@${un})` : dn;
        });
      await db.createActivity({
        title: `Tour: ${route.name} · ${event.title}`,
        location: {
          name: first.name,
          address: '',
          lat: first.lat,
          lng: first.lng,
          share: eventShare,
          unverified: true,
          event_id: event.id,
          event_title: event.title,
          // Anche a livello "location" (oltre che dentro tour): così la classifica
          // dell'evento riconosce il nome dell'itinerario collegato.
          route_id: route.id,
          route_name: route.name,
          tour: {
            route_id: route.id,
            route_name: route.name,
            target: 2,
            current: 0,
            stops,
            visited: [{ name: first.name, lat: first.lat, lng: first.lng, arrived_at: new Date().toISOString(), drinksAtStart: 0, verified: false }],
          },
        },
        drank_with: companions,
        drinks: [],
        is_active: true,
        bac_level: 0,
        total_units: 0,
        duration: 1,
      });
      window.location.href = '/';
    } catch (err) {
      alert('Errore nell\'avvio del tour: ' + (err.message || err));
      setStartingSession(false);
    }
  };

  const respond = async (status) => {
    if (!currentUser) { router.push('/auth'); return; }
    if (responding) return;                    // evita doppi invii ravvicinati
    if (event?.myResponse === status) return;  // stessa risposta → niente da fare
    setResponding(true);
    try {
      await db.respondToEvent(id, status, shareToken);
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

  // URL CANONICO dell'evento (sempre sul dominio ufficiale), così il link condiviso
  // funziona e viene catturato dalla PWA anche se l'app è aperta da un altro dominio.
  const eventUrl = () => siteUrl(`/events/${id}${event?.share_token ? `?t=${event.share_token}` : ''}`);

  const shareText = () => {
    const d = event?.date ? formatEventDate(event.date) : '';
    return `🍻 ${event?.title || 'Evento Strabar'}\n📅 ${d}${event?.location_name ? `\n📍 ${event.location_name}` : ''}\n\nUnisciti a me su Strabar! ${eventUrl()}`;
  };

  const shareEvent = async () => {
    const url = eventUrl();
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

  const addInvitee = (p) => {
    setToInvite((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setInvitePeople((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setInviteQuery(''); setInviteResults([]);
  };
  const removeInvitee = (uid) => {
    setToInvite((prev) => prev.filter((i) => i !== uid));
    setInvitePeople((prev) => prev.filter((x) => x.id !== uid));
  };

  const sendInvites = async () => {
    if (toInvite.length === 0) { setShowInvite(false); return; }
    await db.inviteToEvent(id, toInvite);
    setToInvite([]); setInvitePeople([]); setInviteQuery('');
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
  // Avvio brindisi/tour consentito solo a partire da 2 ore prima dell'inizio dell'evento.
  const START_WINDOW_MS = 2 * 60 * 60 * 1000;
  const eventStartMs = event.date ? new Date(event.date).getTime() : null;
  const startOpensAtMs = eventStartMs != null && !isNaN(eventStartMs) ? eventStartMs - START_WINDOW_MS : null;
  const canStart = startOpensAtMs == null || (now > 0 && now >= startOpensAtMs);
  const startOpensLabel = startOpensAtMs != null
    ? new Date(startOpensAtMs).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const grouped = { going: [], maybe: [], no: [] };
  (event.responses || []).forEach((r) => { if (grouped[r.status]) grouped[r.status].push(r); });
  const alreadyInvolved = new Set((event.responses || []).map((r) => r.user_id).concat(event.invited || []));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Link href="/events" className="action-btn" style={{ fontSize: '14px', width: 'fit-content' }}>
        <ArrowLeft size={16} /> Tutti gli eventi
      </Link>

      {/* Intestazione evento */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255, 32, 0,0.06) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800 }}>{event.title}</h1>
            {(() => {
              const v = event.visibility || 'public';
              const meta = v === 'private'
                ? { icon: '🔒', label: 'Nella lista: nessuno', color: 'var(--error)' }
                : v === 'friends'
                ? { icon: '👥', label: 'Nella lista: amici', color: 'var(--secondary)' }
                : { icon: '🌍', label: 'Nella lista: tutti', color: 'var(--success)' };
              const linkOn = event.link_sharing !== false;
              return (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${meta.color}`, color: meta.color }}>
                    {meta.icon} {meta.label}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${linkOn ? 'var(--primary)' : 'var(--border-dark)'}`, color: linkOn ? 'var(--primary)' : 'var(--text-dark-secondary)' }}>
                    🔗 Link {linkOn ? 'attivo' : 'disattivato'}
                  </span>
                </span>
              );
            })()}
          </div>
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

        {isHost && (event.link_sharing === false ? (
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
            🔗 <strong style={{ color: 'var(--text-dark-primary)' }}>Link di invito disattivato</strong>: accedono solo tu e le persone che inviti per nome. Un link inoltrato non funziona. Puoi riattivarlo da “Modifica”.
          </p>
        ) : (event.visibility || 'public') !== 'public' ? (
          <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
            🔗 Non compare nella lista {(event.visibility === 'private') ? 'a nessuno' : '(solo agli amici)'}, ma <strong style={{ color: 'var(--text-dark-primary)' }}>chiunque riceva il link qui sotto può aprirlo e partecipare — anche senza account</strong>. Condividilo solo con chi vuoi invitare.
          </p>
        ) : null)}
        {!isHost && event.viaLink && (event.visibility || 'public') !== 'public' && (
          <p style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '8px', lineHeight: 1.4 }}>
            👋 Sei qui tramite un <strong>link condiviso</strong>: l&apos;organizzatore ti ha invitato a questo evento {(event.visibility === 'private') ? 'privato' : 'riservato agli amici'}.
          </p>
        )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '14px', color: 'var(--text-dark-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RouteIcon size={16} /> Itinerario: <strong style={{ color: 'var(--primary)' }}>{event.route_name}</strong>
              </span>
              {/* Link al tour solo se NON è mostrato inline (cioè non è il tour del proprietario):
                  per i tour del proprietario — anche privati — mostriamo le tappe qui sotto, così
                  restano visibili DENTRO l'evento senza finire nella lista pubblica. */}
              {!(event.route && event.route.waypoints) && (
                <Link
                  href={event.route_id ? `/routes?routeId=${event.route_id}` : '/routes'}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RouteIcon size={14} /> Vedi itinerario
                </Link>
              )}
            </div>
          )}
          {/* Itinerario del proprietario mostrato INLINE (tappe), con la privacy dell'evento. */}
          {event.route && Array.isArray(event.route.waypoints) && event.route.waypoints.length > 0 && (
            <div style={{ marginTop: '4px', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', borderRadius: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-dark-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RouteIcon size={14} color="var(--primary)" /> Tappe dell&apos;itinerario
              </div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {event.route.waypoints.map((w, i) => {
                  const wlat = w.lat, wlng = w.lng ?? w.lon;
                  const mapHref = (wlat != null && wlng != null)
                    ? `https://www.google.com/maps/search/?api=1&query=${wlat},${wlng}`
                    : (w.name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(w.name)}` : null);
                  return (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>{i + 1}</span>
                      <span style={{ minWidth: 0, fontSize: '14px', color: '#FFF' }}>
                        {w.name || `Tappa ${i + 1}`}
                        {w.address && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>{w.address}</span>}
                      </span>
                      {mapHref && (
                        <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', flexShrink: 0 }}>
                          <ExternalLink size={11} /> Mappa
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
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
              onClick={event.route_id ? handleStartEventTour : handleStartEventSession}
              disabled={startingSession || !canStart}
              className="btn btn-primary"
              style={{ width: '100%', borderRadius: '14px', padding: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: canStart ? 1 : 0.55, cursor: canStart ? 'pointer' : 'not-allowed' }}
            >
              {startingSession ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : event.route_id ? <RouteIcon size={16} /> : <Beer size={16} />}
              {event.route_id ? 'Avvia tour guidato' : 'Registra brindisi all’evento'}
            </button>
          </>
        )}
        {currentUser && (isHost || event.isInvited || event.myResponse) && (
          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '6px' }}>
            {!canStart
              ? `⏳ Potrai avviare ${event.route_id ? 'il tour' : 'il brindisi'} da 2 ore prima dell’inizio${startOpensLabel ? ` — dalle ${startOpensLabel}` : ''}.`
              : event.route_id
                ? 'Avvia il tour guidato sulle tappe dell’itinerario, con i partecipanti pre-taggati. Conta per la classifica dell’evento.'
                : 'Avvia una sessione live già con il luogo dell’evento e i partecipanti pre-taggati.'}
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
            <div style={{ marginBottom: '16px' }}>
              {/* Persone selezionate */}
              {invitePeople.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {invitePeople.map((p) => (
                    <button key={p.id} type="button" onClick={() => removeInvitee(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--primary)', background: 'rgba(255, 32, 0,0.12)', color: 'var(--primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                      <Check size={13} /> {p.name} <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* Ricerca persone (server-side) */}
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
                <input className="form-control" placeholder="Cerca per nome o @username…" value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} style={{ paddingLeft: 32 }} />
                {(inviteSearching || inviteResults.length > 0) && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card-dark, #1a1d2e)', border: '1px solid var(--border-dark)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: '220px', overflowY: 'auto' }}>
                    {inviteSearching && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cerco atleti…
                      </div>
                    )}
                    {inviteResults.map((p) => {
                      const involved = alreadyInvolved.has(p.id);
                      const sel = toInvite.includes(p.id);
                      return (
                        <button key={p.id} type="button" disabled={involved}
                          onClick={() => (sel ? removeInvitee(p.id) : addInvitee({ id: p.id, name: p.display_name || p.username || 'Atleta', username: p.username || null }))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', textAlign: 'left', padding: '9px 12px', background: sel ? 'rgba(255,32,0,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-dark)', cursor: involved ? 'default' : 'pointer', opacity: involved ? 0.5 : 1 }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '13px', color: '#FFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name || p.username}</span>
                            {p.username && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{p.username}</span>}
                          </span>
                          {involved ? <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>già coinvolto</span> : sel ? <Check size={15} color="var(--primary)" /> : <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700 }}>+ Invita</span>}
                        </button>
                      );
                    })}
                    {!inviteSearching && inviteResults.length === 0 && inviteQuery.trim().length >= 2 && (
                      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-dark-secondary)' }}>Nessun atleta trovato.</div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={sendInvites} disabled={toInvite.length === 0} className="btn btn-primary" style={{ width: '100%', fontSize: '13px', opacity: toInvite.length === 0 ? 0.6 : 1 }}>
                Invia {toInvite.length > 0 ? `(${toInvite.length})` : ''} inviti
              </button>
            </div>
          )}

          {(event.invited || []).length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Nessun invitato. Usa &quot;Invita amici&quot; per coinvolgere il gruppo.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(event.invitedProfiles || []).map((p) => {
                  const status = (event.responses || []).find((r) => r.user_id === p.id)?.status;
                  const badge = status === 'going' ? { t: 'Partecipa', c: 'var(--success)' }
                    : status === 'maybe' ? { t: 'Forse', c: 'var(--secondary)' }
                    : status === 'no' ? { t: 'Non può', c: 'var(--error)' }
                    : { t: 'In attesa', c: 'var(--text-dark-secondary)' };
                  return (
                    <Link key={p.id} href={`/u/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-input-dark)', borderRadius: '8px', border: '1px solid var(--border-dark)' }}>
                      <div className="activity-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                        {(p.display_name || p.username || 'U').charAt(0)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.display_name || p.username}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>@{p.username || 'utente'}</div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: badge.c, flexShrink: 0 }}>{badge.t}</span>
                    </Link>
                  );
                })}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '10px' }}>
                {(event.invited || []).length} persone invitate • {grouped.going.length} hanno confermato.
              </p>
            </>
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
              {(() => {
                // Collegabili: i MIEI itinerari (qualunque privacy) o quelli PUBBLICI.
                // Mantengo selezionabile l'itinerario già collegato anche se non rientra nel filtro.
                const selectable = routes.filter((r) => r.user_id === currentUser?.id || r.visibility === 'public' || r.id === edit.routeId);
                const sel = routes.find((r) => r.id === edit.routeId);
                const mineNonPublic = sel && sel.user_id === currentUser?.id && (sel.visibility || 'public') !== 'public';
                return (
                  <>
                    <select className="form-control" value={edit.routeId} onChange={(e) => setEdit((p) => ({ ...p, routeId: e.target.value }))}>
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
                        <> <br />⚠️ <span style={{ color: 'var(--secondary)' }}>Itinerario {sel.visibility === 'private' ? 'privato' : 'riservato agli amici'}: le tappe saranno visibili <strong>dentro l&apos;evento</strong> secondo la privacy dell&apos;evento, ma resta fuori dalla lista pubblica dei tour.</span></>
                      )}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* ACCESSO — due concetti distinti */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
              <label className="form-label">Chi lo vede nella lista eventi</label>
              <div className="seg-tabs" style={{ display: 'flex', gap: '6px' }}>
                {[
                  { v: 'public', t: '🌍 Tutti' },
                  { v: 'friends', t: '👥 Amici' },
                  { v: 'private', t: '🔒 Nessuno' },
                ].map((o) => (
                  <div
                    key={o.v}
                    onClick={() => setEdit((p) => ({ ...p, visibility: o.v }))}
                    style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: '9px 4px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', border: edit.visibility === o.v ? '1px solid var(--primary)' : '1px solid var(--border-dark)', color: edit.visibility === o.v ? 'var(--primary)' : 'var(--text-dark-primary)', background: 'var(--bg-input-dark)' }}
                  >{o.t}</div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {edit.visibility === 'public'
                  ? '🌍 Compare nella lista eventi a tutti gli utenti.'
                  : edit.visibility === 'friends'
                  ? '👥 Compare nella lista solo ai tuoi amici.'
                  : '🔒 Non compare nella lista: lo vedono solo tu e le persone che inviti.'}
              </p>
            </div>

            <div className="form-group">
              <label
                onClick={() => setEdit((p) => ({ ...p, linkSharing: !p.linkSharing }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer' }}
              >
                <span style={{ fontWeight: 700, fontSize: '14px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px' }}>🔗 Link di invito</span>
                <span style={{ position: 'relative', width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0, transition: 'var(--transition)', background: edit.linkSharing ? 'var(--primary)' : 'var(--border-dark)' }}>
                  <span style={{ position: 'absolute', top: '2px', left: edit.linkSharing ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'var(--transition)' }} />
                </span>
              </label>
              <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {edit.linkSharing
                  ? '✅ Chiunque riceva il link può aprire e partecipare — anche senza account e anche se non lo vede nella lista.'
                  : '⛔ Solo tu e le persone che inviti per nome potete accedere. Un link inoltrato non funzionerà.'}
              </p>
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
