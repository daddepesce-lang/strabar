'use client';

import { useEffect, useState, use, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Loader, ArrowLeft, Trophy, Megaphone, Star, Bell, Clock, ShieldCheck, ShoppingCart, ImagePlus, Pencil, Trash2, BarChart3, Eye, MousePointerClick, CalendarClock, X } from 'lucide-react';
import { OPTION_SCHEMA, defaultOptions, computePrice, euro } from '@/lib/venuePricing';

const SERVICE_NAME = { sponsored_event: 'Evento sponsorizzato', promo: 'Promo nel feed', notify: 'Notifica clienti' };
const SERVICE_ICON = { sponsored_event: Star, promo: Megaphone, notify: Bell };
const ORDER_LABEL = { pending: '⏳ In attesa di pagamento', paid: '✅ Pagato', active: '🟢 Attivo', canceled: '✖️ Annullato', rejected: '✖️ Rifiutato' };

// Area riservata del LOCALE (gestore), divisa in SEZIONI con menu:
//  Classifiche · Servizi · Carrello · Banner · Ordini.
export default function VenueManagePage({ params }) {
  const { key } = use(params);
  const placeKey = decodeURIComponent(key || '');

  const [user, setUser] = useState(undefined); // undefined = loading
  const [claim, setClaim] = useState(null);
  const [isManager, setIsManager] = useState(false);
  const [venueName, setVenueName] = useState(placeKey);
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [myEvents, setMyEvents] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('classifiche'); // classifiche | servizi | carrello | banner | ordini
  const [form, setForm] = useState({ contact_name: '', role: 'titolare', phone: '', email: '', business_name: '', vat: '', address: '', website: '', note: '' });
  const setF = (patch) => setForm((p) => ({ ...p, ...patch }));
  const [submitting, setSubmitting] = useState(false);

  const [eventChoice, setEventChoice] = useState({}); // serviceId -> eventId
  const [svcInput, setSvcInput] = useState({});       // serviceId -> { title, body, link, message, image }
  const setInput = (id, patch) => setSvcInput((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const [svcOpt, setSvcOpt] = useState({});           // serviceId -> opzioni di prezzo
  const setOpt = (id, patch) => setSvcOpt((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const [uploadingFor, setUploadingFor] = useState(null); // serviceId in upload

  const [cart, setCart] = useState([]); // { uid, serviceId, code, name, price, options, meta, eventId, label }
  const [paying, setPaying] = useState(false);

  const [openOrder, setOpenOrder] = useState(null);
  const [canceling, setCanceling] = useState(null);

  const [editBanner, setEditBanner] = useState(null); // banner in modifica
  const [bnForm, setBnForm] = useState({ title: '', body: '', link_url: '', cta: '', image_url: '' });
  const [savingBanner, setSavingBanner] = useState(false);
  const [extendDays, setExtendDays] = useState({}); // bannerId -> giorni proroga

  const loadManagerData = async () => {
    const [svc, ord, evs, bns] = await Promise.all([
      db.getVenueServices(placeKey).catch(() => []),
      db.getMyVenueOrders(placeKey).catch(() => []),
      db.getMyUpcomingEvents().catch(() => []),
      db.getMyVenueBanners(placeKey).catch(() => []),
    ]);
    setServices(svc); setOrders(ord); setMyEvents(evs); setBanners(bns);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await db.getCurrentUser().catch(() => null);
      if (cancelled) return;
      setUser(u || null);
      if (u?.email) setForm((prev) => ({ ...prev, email: u.email }));
      fetch(`/api/venue/${encodeURIComponent(placeKey)}?period=all`).then((r) => r.json()).then((d) => {
        if (cancelled) return;
        if (d?.name) setVenueName(d.name);
        setStats({ sessionsCount: d?.sessionsCount || 0, board: d?.board || [] });
      }).catch(() => {});
      if (u) {
        const claims = await db.getMyVenueClaims().catch(() => []);
        const mine = (claims || []).filter((x) => x.venue_key === placeKey);
        const c = mine.find((x) => x.status === 'approved') || mine.find((x) => x.status === 'pending') || mine[0] || null;
        const mgr = c?.status === 'approved';
        if (cancelled) return;
        setClaim(c); setIsManager(mgr);
        if (mgr) await loadManagerData();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (e) { alert('Errore: ' + (e.message || e)); }
    finally { setSubmitting(false); }
  };

  // ---- Immagine banner (servizio promo) ----
  const uploadPromoImage = async (serviceId, file) => {
    if (!file || !file.type.startsWith('image/')) { alert('Seleziona un’immagine valida.'); return; }
    setUploadingFor(serviceId);
    try {
      const { url } = await db.uploadImage(file);
      setInput(serviceId, { image: url });
    } catch (e) { alert('Upload non riuscito: ' + (e.message || e)); }
    finally { setUploadingFor(null); }
  };

  // ---- Carrello ----
  const buildItem = (svc) => {
    const inp = svcInput[svc.id] || {};
    let eventId = null;
    const meta = {};
    if (svc.code === 'sponsored_event') {
      eventId = eventChoice[svc.id];
      if (!eventId) { alert('Scegli quale tuo evento sponsorizzare.'); return null; }
    } else if (svc.code === 'promo') {
      if (!inp.title?.trim()) { alert('Scrivi almeno il titolo della promo.'); return null; }
      meta.title = inp.title; meta.body = inp.body; meta.link = inp.link; if (inp.image) meta.image = inp.image;
    } else if (svc.code === 'notify') {
      if (!inp.message?.trim()) { alert('Scrivi il messaggio da inviare ai clienti.'); return null; }
      meta.message = inp.message; meta.link = inp.link;
    }
    const options = { ...defaultOptions(svc.code), ...(svcOpt[svc.id] || {}) };
    const price = computePrice(svc, options);
    return { uid: `${svc.id}-${Date.now()}`, serviceId: svc.id, code: svc.code, name: svc.name, price, options, meta, eventId, label: meta.title || meta.message || (eventId ? (myEvents.find((e) => e.id === eventId)?.title || 'Evento') : svc.name) };
  };

  const addToCart = (svc) => {
    const item = buildItem(svc);
    if (!item) return;
    setCart((c) => [...c, item]);
    // reset input del servizio
    setSvcInput((p) => ({ ...p, [svc.id]: {} }));
    setEventChoice((p) => ({ ...p, [svc.id]: '' }));
    setTab('carrello');
  };
  const removeFromCart = (uid) => setCart((c) => c.filter((x) => x.uid !== uid));
  const cartTotal = cart.reduce((s, x) => s + (x.price || 0), 0);

  const checkoutCart = async () => {
    if (!cart.length) return;
    setPaying(true);
    try {
      const res = await fetch('/api/stripe/checkout-cart', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueKey: placeKey, items: cart.map((x) => ({ serviceId: x.serviceId, eventId: x.eventId, meta: x.meta, options: x.options })) }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Pagamento non disponibile.'); return; }
      if (data.url) { window.location.href = data.url; }
    } catch (e) { alert('Errore: ' + (e.message || e)); }
    finally { setPaying(false); }
  };

  // ---- Ordini ----
  const cancelOrder = async (o) => {
    if (!confirm('Annullare questo ordine non pagato?')) return;
    setCanceling(o.id);
    try { await db.cancelVenueOrder(o.id); setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: 'canceled' } : x))); }
    catch (e) { alert('Errore: ' + (e.message || e)); }
    finally { setCanceling(null); }
  };

  // ---- Banner ----
  const openEditBanner = (b) => {
    setEditBanner(b);
    setBnForm({ title: b.title || '', body: b.body || '', link_url: b.link_url || '', cta: b.cta || '', image_url: b.image_url || '' });
  };
  const saveBanner = async () => {
    setSavingBanner(true);
    try {
      await db.updateMyBanner(editBanner.id, bnForm);
      setBanners((prev) => prev.map((x) => (x.id === editBanner.id ? { ...x, ...bnForm } : x)));
      setEditBanner(null);
    } catch (e) { alert('Errore: ' + (e.message || e)); }
    finally { setSavingBanner(false); }
  };
  const deleteBanner = async (b) => {
    if (!confirm('Eliminare definitivamente questo banner?')) return;
    try { await db.deleteMyBanner(b.id); setBanners((prev) => prev.filter((x) => x.id !== b.id)); }
    catch (e) { alert('Errore: ' + (e.message || e)); }
  };
  const uploadBannerImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setSavingBanner(true);
    try { const { url } = await db.uploadImage(file); setBnForm((p) => ({ ...p, image_url: url })); }
    catch (e) { alert('Upload non riuscito: ' + (e.message || e)); }
    finally { setSavingBanner(false); }
  };
  // Proroga: aggiunge al carrello una promo con extend_banner_id (paghi e si estende).
  const extendBanner = (b) => {
    const promo = services.find((s) => s.code === 'promo');
    if (!promo) { alert('Servizio promo non disponibile per la proroga.'); return; }
    const days = Number(extendDays[b.id]) || 7;
    const options = { ...defaultOptions('promo'), days };
    const price = computePrice(promo, options);
    setCart((c) => [...c, { uid: `ext-${b.id}-${Date.now()}`, serviceId: promo.id, code: 'promo', name: `Proroga banner (${days}g)`, price, options, meta: { extend_banner_id: b.id }, eventId: null, label: `Proroga: ${b.title}` }]);
    setTab('carrello');
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader size={30} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>;
  }

  const TABS = [
    { id: 'classifiche', label: 'Classifiche', icon: Trophy },
    { id: 'servizi', label: 'Servizi', icon: Star },
    { id: 'carrello', label: `Carrello${cart.length ? ` (${cart.length})` : ''}`, icon: ShoppingCart },
    { id: 'banner', label: 'Banner', icon: Megaphone },
    { id: 'ordini', label: 'Ordini', icon: Clock },
  ];

  return (
    <div style={{ maxWidth: '620px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link href={`/locale/${encodeURIComponent(placeKey)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '13px', marginTop: '8px' }}>
        <ArrowLeft size={16} /> Pagina pubblica
      </Link>

      <div>
        <div style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Area locale</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#FFF' }}>{venueName}</h1>
      </div>

      {/* Richiesta (non gestore) */}
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

      {claim?.status === 'pending' && (
        <div className="card" style={{ padding: '20px', textAlign: 'center', border: '1px solid var(--secondary)' }}>
          <Clock size={28} color="var(--secondary)" style={{ marginBottom: '8px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', marginBottom: '6px' }}>Richiesta inviata 🎉</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>La valutiamo al più presto. Appena approvata, riceverai un&apos;email per attivare l&apos;account del locale.</p>
        </div>
      )}

      {/* GESTORE: menu a sezioni */}
      {isManager && (
        <>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
            {TABS.map((tb) => {
              const Icon = tb.icon; const active = tab === tb.id;
              return (
                <button key={tb.id} type="button" onClick={() => setTab(tb.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '13px', fontWeight: 700, padding: '9px 14px', borderRadius: '20px', cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border-dark)'}`, background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-dark-secondary)' }}>
                  <Icon size={15} /> {tb.label}
                </button>
              );
            })}
          </div>

          {/* SEZIONE: CLASSIFICHE */}
          {tab === 'classifiche' && (
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
          )}

          {/* SEZIONE: SERVIZI */}
          {tab === 'servizi' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>Servizi per il tuo locale</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>Aggiungi al carrello e paga tutto in una volta.</p>
              {services.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>Nessun servizio disponibile al momento.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {services.map((s) => {
                    const Icon = SERVICE_ICON[s.code] || Star;
                    const opts = { ...defaultOptions(s.code), ...(svcOpt[s.id] || {}) };
                    const price = computePrice(s, opts);
                    const schema = OPTION_SCHEMA[s.code] || [];
                    const inp = svcInput[s.id] || {};
                    return (
                      <div key={s.id} style={{ border: '1px solid var(--border-dark)', borderRadius: '14px', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <Icon size={18} color="var(--secondary)" />
                          <strong style={{ fontSize: '15px', color: '#FFF', flex: 1 }}>{s.name}</strong>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--secondary)' }}>{euro(price)}</span>
                        </div>
                        {s.description && <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>{s.description}</p>}

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
                            <input value={inp.title || ''} onChange={(e) => setInput(s.id, { title: e.target.value })} placeholder="Titolo promo (es. Aperitivo 2x1)" className="form-control" style={{ fontSize: '13px' }} />
                            <textarea value={inp.body || ''} onChange={(e) => setInput(s.id, { body: e.target.value })} placeholder="Descrizione (facoltativa)" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                            <input value={inp.link || ''} onChange={(e) => setInput(s.id, { link: e.target.value })} placeholder="Link (facoltativo)" className="form-control" style={{ fontSize: '13px' }} />
                            {/* Immagine del banner */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {inp.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={inp.image} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                              ) : null}
                              <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {uploadingFor === s.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={13} />}
                                {inp.image ? 'Cambia immagine' : 'Aggiungi immagine'}
                                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPromoImage(s.id, f); }} />
                              </label>
                              {inp.image && <button type="button" onClick={() => setInput(s.id, { image: '' })} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>Rimuovi</button>}
                            </div>
                          </div>
                        )}
                        {s.code === 'notify' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                            <textarea value={inp.message || ''} onChange={(e) => setInput(s.id, { message: e.target.value })} placeholder="Messaggio ai clienti (es. Stasera live music dalle 21!)" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                            <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>Inviata solo a chi rientra nella fascia scelta e ha accettato le comunicazioni commerciali.</p>
                          </div>
                        )}
                        <button onClick={() => addToCart(s)} className="btn btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '10px', fontWeight: 700, fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <ShoppingCart size={15} /> Aggiungi al carrello — {euro(price)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SEZIONE: CARRELLO */}
          {tab === 'carrello' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShoppingCart size={18} color="var(--secondary)" /> Carrello</h2>
              {cart.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '16px' }}>Il carrello è vuoto. Aggiungi un servizio dalla sezione <button onClick={() => setTab('servizi')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 700 }}>Servizi</button>.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {cart.map((it) => (
                      <div key={it.uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', color: '#FFF', fontWeight: 700 }}>{it.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--secondary)', flexShrink: 0 }}>{euro(it.price)}</span>
                        <button type="button" onClick={() => removeFromCart(it.uid)} title="Rimuovi" style={{ background: 'rgba(239,68,68,0.12)', border: 'none', color: '#EF4444', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-dark)' }}>
                    <span style={{ fontSize: '14px', color: '#FFF', fontWeight: 700 }}>Totale</span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--secondary)' }}>{euro(cartTotal)}</span>
                  </div>
                  <button onClick={checkoutCart} disabled={paying} className="btn btn-primary" style={{ width: '100%', borderRadius: '24px', padding: '12px', fontWeight: 800, fontSize: '15px' }}>
                    {paying ? 'Apro il pagamento…' : `Vai al pagamento — ${euro(cartTotal)}`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* SEZIONE: BANNER (gestione + analytics + proroga) */}
          {tab === 'banner' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}><Megaphone size={18} color="var(--secondary)" /> I tuoi banner</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>Modifica, proroga, elimina e controlla le statistiche dei banner che hai acquistato.</p>
              {banners.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>Nessun banner. Acquista una <button onClick={() => setTab('servizi')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 700 }}>Promo nel feed</button>.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {banners.map((b) => {
                    const expired = b.ends_at && new Date(b.ends_at) < new Date();
                    const live = b.active && !expired;
                    const ctr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : '0.0';
                    return (
                      <div key={b.id} style={{ border: '1px solid var(--border-dark)', borderRadius: '14px', padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          {b.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFF' }}>{b.title}</div>
                            <div style={{ fontSize: '11px', color: live ? 'var(--success)' : 'var(--text-dark-secondary)' }}>
                              {live ? '🟢 Attivo' : expired ? '⏱️ Scaduto' : '⏸️ Non attivo'}
                              {b.ends_at && ` · fino al ${new Date(b.ends_at).toLocaleDateString('it-IT')}`}
                            </div>
                          </div>
                        </div>

                        {/* Analytics */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={13} /> {b.impressions || 0}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>visualizzazioni</div>
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MousePointerClick size={13} /> {b.clicks || 0}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>click</div>
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--secondary)' }}>{ctr}%</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>CTR</div>
                          </div>
                        </div>

                        {/* Azioni */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          <button onClick={() => openEditBanner(b)} className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Pencil size={13} /> Modifica</button>
                          <button onClick={() => deleteBanner(b)} className="btn" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', border: '1px solid var(--error)', color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Trash2 size={13} /> Elimina</button>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
                            <select value={extendDays[b.id] || 7} onChange={(e) => setExtendDays((p) => ({ ...p, [b.id]: Number(e.target.value) }))} className="form-control" style={{ fontSize: '12px', height: '34px', width: 'auto', padding: '4px 28px 4px 10px' }}>
                              {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d}g</option>)}
                            </select>
                            <button onClick={() => extendBanner(b)} className="btn btn-primary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><CalendarClock size={13} /> Proroga</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SEZIONE: ORDINI */}
          {tab === 'ordini' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px' }}>I tuoi ordini</h2>
              {orders.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>Nessun ordine ancora.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {orders.map((o) => {
                    const expanded = openOrder === o.id;
                    const m = o.meta || {};
                    return (
                      <div key={o.id} style={{ borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', overflow: 'hidden' }}>
                        <button type="button" onClick={() => setOpenOrder(expanded ? null : o.id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontSize: '13px', color: '#FFF', minWidth: 0 }}>{SERVICE_NAME[o.service_code] || o.service_code}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', whiteSpace: 'nowrap' }}>{ORDER_LABEL[o.status] || o.status} · {euro(o.amount_cents)}</span>
                        </button>
                        {expanded && (
                          <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-dark)', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ marginTop: '8px' }}>Data: {new Date(o.created_at).toLocaleString('it-IT')}</div>
                            {m.title && <div>Titolo: <span style={{ color: '#FFF' }}>{m.title}</span></div>}
                            {m.message && <div>Messaggio: <span style={{ color: '#FFF' }}>{m.message}</span></div>}
                            {m.body && <div>Testo: <span style={{ color: '#FFF' }}>{m.body}</span></div>}
                            {m.link && <div>Link: <span style={{ color: '#FFF' }}>{m.link}</span></div>}
                            {o.paid_at && <div>Pagato il: {new Date(o.paid_at).toLocaleString('it-IT')}</div>}
                            {o.status === 'pending' && (
                              <button type="button" onClick={() => cancelOrder(o)} disabled={canceling === o.id} className="btn" style={{ marginTop: '6px', alignSelf: 'flex-start', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: '16px', padding: '6px 14px', fontSize: '12px', fontWeight: 700 }}>
                                {canceling === o.id ? 'Annullo…' : 'Annulla ordine'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODALE: modifica banner */}
      {editBanner && (
        <div onClick={() => setEditBanner(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: '440px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '16px', color: '#FFF' }}>Modifica banner</strong>
              <button onClick={() => setEditBanner(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <input value={bnForm.title} onChange={(e) => setBnForm((p) => ({ ...p, title: e.target.value }))} placeholder="Titolo" className="form-control" style={{ fontSize: '13px' }} />
            <textarea value={bnForm.body} onChange={(e) => setBnForm((p) => ({ ...p, body: e.target.value }))} placeholder="Descrizione" rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
            <input value={bnForm.link_url} onChange={(e) => setBnForm((p) => ({ ...p, link_url: e.target.value }))} placeholder="Link" className="form-control" style={{ fontSize: '13px' }} />
            <input value={bnForm.cta} onChange={(e) => setBnForm((p) => ({ ...p, cta: e.target.value }))} placeholder="Testo del bottone (es. Scopri)" className="form-control" style={{ fontSize: '13px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {bnForm.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bnForm.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
              )}
              <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ImagePlus size={13} /> {bnForm.image_url ? 'Cambia immagine' : 'Aggiungi immagine'}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadBannerImage(f); }} />
              </label>
              {bnForm.image_url && <button type="button" onClick={() => setBnForm((p) => ({ ...p, image_url: '' }))} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>Rimuovi</button>}
            </div>
            <button onClick={saveBanner} disabled={savingBanner} className="btn btn-primary" style={{ borderRadius: '20px', padding: '11px', fontWeight: 700, marginTop: '4px' }}>{savingBanner ? 'Salvo…' : 'Salva modifiche'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
