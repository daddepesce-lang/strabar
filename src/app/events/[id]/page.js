'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import {
  ArrowLeft, Calendar, MapPin, Users, Crown, Check, HelpCircle, X,
  Route as RouteIcon, Trash2, UserPlus, ExternalLink, Share2, MessageCircle,
} from 'lucide-react';

function formatEventDate(ds) {
  if (!ds) return 'Data da definire';
  const d = new Date(ds);
  if (isNaN(d)) return ds;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [toInvite, setToInvite] = useState([]);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const user = await db.getCurrentUser();
      setCurrentUser(user);
      const ev = await db.getEvent(id);
      setEvent(ev);
      if (user) setFollowing(await db.getFollowing(user.id));
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

  const respond = async (status) => {
    if (!currentUser) { router.push('/auth'); return; }
    try {
      await db.respondToEvent(id, status);
      await load();
    } catch (err) {
      alert(err.message || 'Errore');
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
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22,24,34,1) 0%, rgba(255,94,0,0.06) 100%)' }}>
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
                className="btn"
                style={{
                  flex: '1 1 120px', borderRadius: '12px', padding: '12px',
                  border: `1px solid ${active ? color : 'var(--border-dark)'}`,
                  background: active ? color : 'var(--bg-input-dark)',
                  color: active ? '#0B0C10' : 'var(--text-dark-primary)',
                  fontWeight: 700,
                }}
              >
                <Icon size={16} /> {label}
              </button>
            );
          })}
        </div>
      </div>

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
            {currentUser && (
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
                          background: sel ? 'rgba(255,94,0,0.12)' : 'var(--bg-input-dark)',
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
