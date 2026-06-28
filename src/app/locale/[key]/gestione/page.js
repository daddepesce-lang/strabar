'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Loader, ArrowLeft, Trophy, Megaphone, Star, Bell, Clock, ShieldCheck } from 'lucide-react';
import { OPTION_SCHEMA, defaultOptions, computePrice, euro } from '@/lib/venuePricing';

// Area riservata del LOCALE (gestore). Modello: richiesta → approvazione admin.
//  • Non gestore → form "Richiedi di gestire questo locale".
//  • In attesa  → messaggio.
//  • Gestore    → statistiche + servizi acquistabili (prezzi per-locale) + storico ordini.
export default function VenueManagePage({ params }) {
  const { key } = use(params);
  const placeKey = decodeURIComponent(key || '');

  const [user, setUser] = useState(undefined); // undefined = loading
  const [claim, setClaim] = useState(null);     // claim per questo locale
  const [isManager, setIsManager] = useState(false);
  const [venueName, setVenueName] = useState(placeKey);
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ contact_name: '', role: 'titolare', phone: '', email: '', business_name: '', vat: '', address: '', website: '', note: '' });
  const setF = (patch) => setForm((p) => ({ ...p, ...patch }));
  const [submitting, setSubmitting] = useState(false);
  const [buying, setBuying] = useState(null); // service id in corso
  const [eventChoice, setEventChoice] = useState({}); // serviceId -> eventId
  const [svcInput, setSvcInput] = useState({}); // serviceId -> { title, body, link, message }
  const setInput = (id, patch) => setSvcInput((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const [svcOpt, setSvcOpt] = useState({}); // serviceId -> opzioni di prezzo (durata/posizione/audience/spotlight)
  const setOpt = (id, patch) => setSvcOpt((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await db.getCurrentUser().catch(() => null);
      if (cancelled) return;
      setUser(u || null);
      // Se loggato, l'email della richiesta è quella dell'account (campo bloccato).
      if (u?.email) setForm((prev) => ({ ...prev, email: u.email }));
      // nome leggibile del locale
      fetch(`/api/venue/${encodeURIComponent(placeKey)}?period=all`).then((r) => r.json()).then((d) => {
        if (cancelled) return;
        if (d?.name) setVenueName(d.name);
        setStats({ sessionsCount: d?.sessionsCount || 0, board: d?.board || [] });
      }).catch(() => {});
      if (u) {
        const claims = await db.getMyVenueClaims().catch(() => []);
        const c = (claims || []).find((x) => x.venue_key === placeKey) || null;
        const mgr = c?.status === 'approved';
        if (cancelled) return;
        setClaim(c);
        setIsManager(mgr);
        if (mgr) {
          const [svc, ord, evs] = await Promise.all([
            db.getVenueServices(placeKey).catch(() => []),
            db.getMyVenueOrders(placeKey).catch(() => []),
            db.getMyUpcomingEvents().catch(() => []),
          ]);
          if (cancelled) return;
          setServices(svc);
          setOrders(ord);
          setMyEvents(evs);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [placeKey]);

  const submitClaim = async () => {
    if (!form.contact_name.trim() || !(form.phone.trim() || form.email.trim())) {
      alert('Inserisci almeno nome del referente e un contatto (telefono o email).');
      return;
    }
    setSubmitting(true);
    try {
      await db.requestVenueClaim(placeKey, venueName, form);
      setClaim({ status: 'pending', venue_key: placeKey });
    } catch (e) {
      alert('Errore: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const buy = async (svc) => {
    // Input per servizio: evento (sponsored), testi (promo), messaggio (notify).
    let eventId = null;
    let meta = {};
    const inp = svcInput[svc.id] || {};
    if (svc.code === 'sponsored_event') {
      eventId = eventChoice[svc.id];
      if (!eventId) { alert('Scegli prima quale tuo evento sponsorizzare (creane uno dalla pagina Eventi se non ne hai).'); return; }
    } else if (svc.code === 'promo') {
      if (!inp.title?.trim()) { alert('Scrivi almeno il titolo della promo.'); return; }
      meta = { title: inp.title, body: inp.body, link: inp.link };
    } else if (svc.code === 'notify') {
      if (!inp.message?.trim()) { alert('Scrivi il messaggio da inviare ai clienti.'); return; }
      meta = { message: inp.message, link: inp.link };
    }
    const options = { ...defaultOptions(svc.code), ...(svcOpt[svc.id] || {}) };
    setBuying(svc.id);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueKey: placeKey, serviceId: svc.id, eventId, meta, options }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Pagamento non disponibile al momento.');
        return;
      }
      if (data.url) { window.location.href = data.url; }
    } catch (e) {
      alert('Errore: ' + (e.message || e));
    } finally {
      setBuying(null);
    }
  };

  const SERVICE_ICON = { sponsored_event: Star, promo: Megaphone, notify: Bell };
  const ORDER_LABEL = { pending: '⏳ In attesa di pagamento', paid: '✅ Pagato', active: '🟢 Attivo', canceled: '✖️ Annullato', rejected: '✖️ Rifiutato' };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader size={30} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>;
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link href={`/locale/${encodeURIComponent(placeKey)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '13px', marginTop: '8px' }}>
        <ArrowLeft size={16} /> Pagina pubblica
      </Link>

      <div>
        <div style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Area locale</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#FFF' }}>{venueName}</h1>
      </div>

      {/* Richiesta (anche senza account): mostrata se non sei gestore e non hai già una pendente */}
      {!isManager && claim?.status !== 'pending' && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#FFF', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} color="var(--secondary)" /> Gestisci questo locale</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px', lineHeight: 1.45 }}>
            Sei il titolare o il gestore di <strong>{venueName}</strong>? Invia una richiesta: dopo l&apos;approvazione potrai creare eventi sponsorizzati, promo e notifiche ai clienti.
          </p>
          {claim?.status === 'rejected' && <p style={{ fontSize: '12px', color: 'var(--error)', marginBottom: '10px' }}>La richiesta precedente è stata rifiutata{claim.admin_note ? `: ${claim.admin_note}` : '.'}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <input value={form.contact_name} onChange={(e) => setF({ contact_name: e.target.value })} placeholder="Nome e cognome del referente *" className="form-control" style={{ fontSize: '13px' }} />
            <select value={form.role} onChange={(e) => setF({ role: e.target.value })} className="form-control" style={{ fontSize: '13px', height: '38px' }}>
              <option value="titolare">Titolare</option>
              <option value="gestore">Gestore</option>
              <option value="staff">Staff / collaboratore</option>
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.phone} onChange={(e) => setF({ phone: e.target.value })} placeholder="Telefono *" className="form-control" style={{ fontSize: '13px', flex: 1 }} />
              <input value={form.email} onChange={(e) => setF({ email: e.target.value })} placeholder="Email *" type="email" disabled={!!user} title={user ? 'Sei loggato: la richiesta userà l’email del tuo account' : undefined} className="form-control" style={{ fontSize: '13px', flex: 1, opacity: user ? 0.6 : 1 }} />
            </div>
            <input value={form.business_name} onChange={(e) => setF({ business_name: e.target.value })} placeholder="Ragione sociale / nome attività" className="form-control" style={{ fontSize: '13px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.vat} onChange={(e) => setF({ vat: e.target.value })} placeholder="P. IVA" className="form-control" style={{ fontSize: '13px', flex: 1 }} />
              <input value={form.website} onChange={(e) => setF({ website: e.target.value })} placeholder="Sito / social" className="form-control" style={{ fontSize: '13px', flex: 1 }} />
            </div>
            <input value={form.address} onChange={(e) => setF({ address: e.target.value })} placeholder="Indirizzo del locale" className="form-control" style={{ fontSize: '13px' }} />
            <textarea value={form.note} onChange={(e) => setF({ note: e.target.value })} placeholder="Note (facoltativo)" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>
            {user
              ? 'Sei loggato: il locale verrà collegato a QUESTO account (email bloccata). Vuoi usarne un altro? Esci e invia la richiesta da non loggato con l’email desiderata.'
              : '* obbligatori: referente e contatto. Userai questa email per registrarti: collegheremo l’account a quel locale.'}
          </p>
          <button onClick={submitClaim} disabled={submitting} className="btn btn-primary" style={{ width: '100%', borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
            {submitting ? 'Invio…' : 'Invia richiesta'}
          </button>
        </div>
      )}

      {/* In attesa */}
      {claim?.status === 'pending' && (
        <div className="card" style={{ padding: '20px', textAlign: 'center', border: '1px solid var(--secondary)' }}>
          <Clock size={28} color="var(--secondary)" style={{ marginBottom: '8px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', marginBottom: '6px' }}>Richiesta inviata 🎉</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>La valutiamo al più presto. Appena approvata, riceverai un&apos;email per attivare l&apos;account del locale.</p>
        </div>
      )}

      {/* Gestore approvato */}
      {isManager && (
        <>
          {/* Statistiche rapide */}
          <div className="card" style={{ padding: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Trophy size={18} color="var(--secondary)" /> Il tuo locale</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--secondary)' }}>{stats?.sessionsCount ?? 0}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>brindisi</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--secondary)' }}>{stats?.board?.length ?? 0}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>clienti in classifica</div>
              </div>
            </div>
            <Link href={`/locale/${encodeURIComponent(placeKey)}`} className="btn btn-secondary" style={{ width: '100%', marginTop: '12px', borderRadius: '16px', fontSize: '13px', padding: '9px' }}>Vedi la classifica pubblica & QR</Link>
          </div>

          {/* Servizi acquistabili */}
          <div className="card" style={{ padding: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>Servizi per il tuo locale</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>Promuovi il tuo locale nella community di Strabar.</p>
            {services.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>Nessun servizio disponibile al momento.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {services.map((s) => {
                  const Icon = SERVICE_ICON[s.code] || Star;
                  const opts = { ...defaultOptions(s.code), ...(svcOpt[s.id] || {}) };
                  const price = computePrice(s, opts);
                  const schema = OPTION_SCHEMA[s.code] || [];
                  return (
                    <div key={s.id} style={{ border: '1px solid var(--border-dark)', borderRadius: '14px', padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <Icon size={18} color="var(--secondary)" />
                        <strong style={{ fontSize: '15px', color: '#FFF', flex: 1 }}>{s.name}</strong>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--secondary)' }}>{euro(price)}</span>
                      </div>
                      {s.description && <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>{s.description}</p>}

                      {/* Opzioni che fanno variare il prezzo (durata/posizione/audience/spotlight) */}
                      {schema.map((opt) => {
                        if (opt.type === 'bool') {
                          return (
                            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#FFF', marginBottom: '10px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!opts[opt.key]} onChange={(e) => setOpt(s.id, { [opt.key]: e.target.checked })} />
                              {opt.label}
                            </label>
                          );
                        }
                        const choices = opt.optionsFrom ? (s.pricing?.[opt.optionsFrom] || opt.fallback || []).map((v) => ({ v, l: opt.render ? opt.render(v) : String(v) })) : opt.options;
                        return (
                          <div key={opt.key} style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', display: 'block', marginBottom: '4px' }}>{opt.label}</label>
                            <select value={opts[opt.key]} onChange={(e) => setOpt(s.id, { [opt.key]: opt.optionsFrom ? Number(e.target.value) : e.target.value })} className="form-control" style={{ fontSize: '13px', height: '38px' }}>
                              {choices.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                            </select>
                          </div>
                        );
                      })}

                      {s.code === 'sponsored_event' && (
                        <select value={eventChoice[s.id] || ''} onChange={(e) => setEventChoice((p) => ({ ...p, [s.id]: e.target.value }))} className="form-control" style={{ fontSize: '13px', height: '38px', marginBottom: '10px' }}>
                          <option value="">— Scegli il tuo evento —</option>
                          {myEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                        </select>
                      )}
                      {s.code === 'sponsored_event' && myEvents.length === 0 && (
                        <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>Non hai eventi futuri: <Link href="/events" style={{ color: 'var(--secondary)' }}>creane uno</Link> e torna qui.</p>
                      )}
                      {s.code === 'promo' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                          <input value={svcInput[s.id]?.title || ''} onChange={(e) => setInput(s.id, { title: e.target.value })} placeholder="Titolo promo (es. Aperitivo 2x1)" className="form-control" style={{ fontSize: '13px' }} />
                          <textarea value={svcInput[s.id]?.body || ''} onChange={(e) => setInput(s.id, { body: e.target.value })} placeholder="Descrizione (facoltativa)" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                          <input value={svcInput[s.id]?.link || ''} onChange={(e) => setInput(s.id, { link: e.target.value })} placeholder="Link (facoltativo)" className="form-control" style={{ fontSize: '13px' }} />
                        </div>
                      )}
                      {s.code === 'notify' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                          <textarea value={svcInput[s.id]?.message || ''} onChange={(e) => setInput(s.id, { message: e.target.value })} placeholder="Messaggio ai clienti (es. Stasera live music dalle 21!)" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Inviata solo a chi rientra nella fascia scelta e ha accettato le comunicazioni commerciali.</p>
                        </div>
                      )}
                      <button onClick={() => buy(s)} disabled={buying === s.id} className="btn btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '10px', fontWeight: 700, fontSize: '14px' }}>
                        {buying === s.id ? 'Apro il pagamento…' : `Acquista — ${euro(price)}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Storico ordini */}
          {orders.length > 0 && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px' }}>I tuoi ordini</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {orders.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)' }}>
                    <span style={{ fontSize: '13px', color: '#FFF' }}>{o.service_code === 'sponsored_event' ? 'Evento sponsorizzato' : o.service_code === 'promo' ? 'Promo nel feed' : o.service_code === 'notify' ? 'Notifica clienti' : o.service_code}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{ORDER_LABEL[o.status] || o.status} · {euro(o.amount_cents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
