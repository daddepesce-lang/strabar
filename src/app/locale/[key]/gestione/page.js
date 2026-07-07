'use client';

import { useEffect, useState, use, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Loader, ArrowLeft, Trophy, Megaphone, Star, Bell, Clock, ShieldCheck, ShoppingCart, ImagePlus, Pencil, Trash2, BarChart3, Eye, MousePointerClick, CalendarClock, X, Beer, Plus, QrCode } from 'lucide-react';
import { OPTION_SCHEMA, defaultOptions, computePrice, euro } from '@/lib/venuePricing';
import { useT } from '@/lib/i18n';

const SERVICE_ICON = { sponsored_event: Star, promo: Megaphone, notify: Bell };

// Area riservata del LOCALE (gestore), divisa in SEZIONI con menu:
//  Classifiche · Servizi · Carrello · Banner · Ordini.
export default function VenueManagePage({ params }) {
  const { key } = use(params);
  const placeKey = decodeURIComponent(key || '');
  const t = useT();

  const svcName = {
    sponsored_event: t('gestione.svcEvent'),
    promo: t('gestione.svcPromo'),
    notify: t('gestione.svcNotify'),
  };
  const orderLabel = {
    pending: t('gestione.orderPending'),
    paid: t('gestione.orderPaid'),
    active: t('gestione.orderActive'),
    canceled: t('gestione.orderCanceled'),
    rejected: t('gestione.orderRejected'),
    ended: t('gestione.orderEnded'),
  };

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

  const [venueDrinks, setVenueDrinks] = useState([]); // drink propri del locale
  const [drinkForm, setDrinkForm] = useState({ name: '', abv: '', units: '' });
  const [addingDrink, setAddingDrink] = useState(false);

  const loadManagerData = async () => {
    const [svc, ord, evs, bns, drk] = await Promise.all([
      db.getVenueServices(placeKey).catch(() => []),
      db.getMyVenueOrders(placeKey).catch(() => []),
      db.getMyUpcomingEvents().catch(() => []),
      db.getMyVenueBanners(placeKey).catch(() => []),
      db.getVenueDrinks(placeKey).catch(() => []),
    ]);
    setServices(svc); setOrders(ord); setMyEvents(evs); setBanners(bns); setVenueDrinks(drk);
  };

  // ---- Drink del locale ----
  const addVenueDrink = async () => {
    const name = drinkForm.name.trim();
    if (!name) { alert(t('gestione.drinkNeedName')); return; }
    setAddingDrink(true);
    try {
      const abv = parseFloat(String(drinkForm.abv).replace(',', '.')) || 0;
      const units = parseFloat(String(drinkForm.units).replace(',', '.')) || 0;
      await db.addVenueDrink(placeKey, { name, abv, units, label: `🍸 ${name}` });
      setDrinkForm({ name: '', abv: '', units: '' });
      setVenueDrinks(await db.getVenueDrinks(placeKey).catch(() => venueDrinks));
    } catch (e) { alert('Errore: ' + (e.message || e)); }
    finally { setAddingDrink(false); }
  };
  const removeVenueDrink = async (id) => {
    if (!confirm('Rimuovere questo drink?')) return;
    try { await db.deleteVenueDrink(id); setVenueDrinks((prev) => prev.filter((d) => d.id !== id)); }
    catch (e) { alert('Errore: ' + (e.message || e)); }
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
      // Niente pagamento online: inviamo gli ordini (pending). Fattura e incasso fuori app.
      const res = await fetch('/api/venue/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueKey: placeKey, items: cart.map((x) => ({ serviceId: x.serviceId, eventId: x.eventId, meta: x.meta, options: x.options })) }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('gestione.orderSendError')); return; }
      setCart([]);
      await loadManagerData();
      setTab('ordini');
      alert(t('gestione.orderSent'));
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
    const expired = b.ends_at && new Date(b.ends_at) < new Date();
    const msg = expired
      ? 'Eliminare definitivamente questo banner?'
      : 'Eliminando ora il banner perdi i giorni rimanenti e NON verrà rimborsato. L’ordine collegato risulterà “Terminato”. Confermi?';
    if (!confirm(msg)) return;
    try {
      await db.deleteMyBanner(b.id);
      setBanners((prev) => prev.filter((x) => x.id !== b.id));
      // Riflette subito lo stato dell'ordine collegato (terminato, senza rimborso).
      if (b.order_id) setOrders((prev) => prev.map((o) => (o.id === b.order_id ? { ...o, status: 'ended' } : o)));
    } catch (e) { alert('Errore: ' + (e.message || e)); }
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
    { id: 'classifiche', label: t('gestione.tabLeaderboard'), icon: Trophy },
    { id: 'drinks', label: t('gestione.tabMyDrinks'), icon: Beer },
    { id: 'servizi', label: t('gestione.tabServices'), icon: Star },
    { id: 'carrello', label: `${t('gestione.tabCart')}${cart.length ? ` (${cart.length})` : ''}`, icon: ShoppingCart },
    { id: 'banner', label: t('gestione.tabBanners'), icon: Megaphone },
    { id: 'ordini', label: t('gestione.tabOrders'), icon: Clock },
  ];

  return (
    <div style={{ maxWidth: '620px', margin: '0 auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Link href={`/locale/${encodeURIComponent(placeKey)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-dark-secondary)', fontSize: '13px', marginTop: '8px' }}>
        <ArrowLeft size={16} /> {t('gestione.backPublic')}
      </Link>

      <div>
        <div style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{t('gestione.areaLabel')}</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#FFF' }}>{venueName}</h1>
      </div>

      {/* Richiesta (non gestore) */}
      {!isManager && claim?.status !== 'pending' && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#FFF', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} color="var(--secondary)" /> {t('gestione.claimTitle')}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', marginBottom: '14px', lineHeight: 1.45 }}>
            {t('gestione.claimDesc', { name: venueName })}
          </p>
          {claim?.status === 'rejected' && <p style={{ fontSize: '12px', color: 'var(--error)', marginBottom: '10px' }}>{t('gestione.claimRejected')}{claim.admin_note ? `: ${claim.admin_note}` : '.'}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            <input value={form.contact_name} onChange={(e) => setF({ contact_name: e.target.value })} placeholder={t('gestione.claimContactPh')} className="form-control" style={{ fontSize: '13px' }} />
            <select value={form.role} onChange={(e) => setF({ role: e.target.value })} className="form-control" style={{ fontSize: '13px', height: '38px' }}>
              <option value="titolare">{t('gestione.claimRoleOwner')}</option>
              <option value="gestore">{t('gestione.claimRoleManager')}</option>
              <option value="staff">{t('gestione.claimRoleStaff')}</option>
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.phone} onChange={(e) => setF({ phone: e.target.value })} placeholder={t('gestione.claimPhonePh')} className="form-control" style={{ fontSize: '13px', flex: 1 }} />
              <input value={form.email} onChange={(e) => setF({ email: e.target.value })} placeholder={t('gestione.claimEmailPh')} type="email" disabled={!!user} className="form-control" style={{ fontSize: '13px', flex: 1, opacity: user ? 0.6 : 1 }} />
            </div>
            <input value={form.business_name} onChange={(e) => setF({ business_name: e.target.value })} placeholder={t('gestione.claimBusinessPh')} className="form-control" style={{ fontSize: '13px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.vat} onChange={(e) => setF({ vat: e.target.value })} placeholder={t('gestione.claimVatPh')} className="form-control" style={{ fontSize: '13px', flex: 1 }} />
              <input value={form.website} onChange={(e) => setF({ website: e.target.value })} placeholder={t('gestione.claimWebsitePh')} className="form-control" style={{ fontSize: '13px', flex: 1 }} />
            </div>
            <input value={form.address} onChange={(e) => setF({ address: e.target.value })} placeholder={t('gestione.claimAddressPh')} className="form-control" style={{ fontSize: '13px' }} />
            <textarea value={form.note} onChange={(e) => setF({ note: e.target.value })} placeholder={t('gestione.claimNotePh')} rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>
            {user ? t('gestione.claimNoteLogged') : t('gestione.claimNoteAnon')}
          </p>
          <button onClick={submitClaim} disabled={submitting} className="btn btn-primary" style={{ width: '100%', borderRadius: '24px', padding: '12px', fontWeight: 700 }}>
            {submitting ? t('gestione.claimSubmitting') : t('gestione.claimSend')}
          </button>
        </div>
      )}

      {claim?.status === 'pending' && (
        <div className="card" style={{ padding: '20px', textAlign: 'center', border: '1px solid var(--secondary)' }}>
          <Clock size={28} color="var(--secondary)" style={{ marginBottom: '8px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', marginBottom: '6px' }}>{t('gestione.claimPendingTitle')}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>{t('gestione.claimPendingDesc')}</p>
        </div>
      )}

      {/* GESTORE: menu a sezioni */}
      {isManager && (
        <>
          {/* Tendina di sezione (prima era una barra a scorrimento orizzontale poco
              evidente su mobile → non si capiva che si potesse scorrere). */}
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            className="form-control"
            aria-label={t('gestione.areaLabel')}
            style={{ width: '100%', height: 46, fontSize: 15, fontWeight: 700, background: 'var(--bg-card-dark)', border: '1px solid var(--border-dark)' }}
          >
            {TABS.map((tb) => (
              <option key={tb.id} value={tb.id}>{tb.label}</option>
            ))}
          </select>

          {/* SEZIONE: CLASSIFICHE */}
          {tab === 'classifiche' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Trophy size={18} color="var(--secondary)" /> {t('gestione.classTitle')}</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--secondary)' }}>{stats?.sessionsCount ?? 0}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{t('gestione.classToasts')}</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--secondary)' }}>{stats?.board?.length ?? 0}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{t('gestione.classCustomers')}</div>
                </div>
              </div>
              <Link href={`/locale/${encodeURIComponent(placeKey)}`} className="btn btn-secondary" style={{ width: '100%', marginTop: '12px', borderRadius: '16px', fontSize: '13px', padding: '9px' }}>{t('gestione.classViewPublic')}</Link>

              {/* LOCANDINA A4 con QR: i clienti scansionano ed entrano subito in classifica */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-dark)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#FFF', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode size={17} color="var(--secondary)" /> {t('gestione.posterTitle')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                  {t('gestione.posterDesc')}
                </p>
                <Link href={`/locale/${encodeURIComponent(placeKey)}/locandina`} className="btn btn-primary" style={{ width: '100%', borderRadius: '16px', fontSize: '13px', padding: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <QrCode size={16} /> {t('gestione.posterCta')}
                </Link>
              </div>
            </div>
          )}

          {/* SEZIONE: I MIEI DRINK */}
          {tab === 'drinks' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}><Beer size={18} color="var(--secondary)" /> {t('gestione.drinksTitle')}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px', lineHeight: 1.45 }}>{t('gestione.drinksDesc')}</p>

              {venueDrinks.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', fontStyle: 'italic', marginBottom: '14px' }}>{t('gestione.drinksEmpty')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {venueDrinks.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)' }}>
                      <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', flexShrink: 0 }}>{d.abv > 0 ? `${d.abv}° · ${(d.units || 0).toFixed(1)} U.A.` : 'analc.'}</span>
                      <button type="button" onClick={() => removeVenueDrink(d.id)} style={{ background: 'rgba(239,68,68,0.12)', border: 'none', color: '#EF4444', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
                <input value={drinkForm.name} onChange={(e) => setDrinkForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('gestione.drinkNamePh')} className="form-control" style={{ fontSize: '13px' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={drinkForm.abv} onChange={(e) => setDrinkForm((p) => ({ ...p, abv: e.target.value }))} placeholder={t('gestione.drinkAbvPh')} type="number" step="0.1" className="form-control" style={{ fontSize: '13px', flex: 1 }} />
                  <input value={drinkForm.units} onChange={(e) => setDrinkForm((p) => ({ ...p, units: e.target.value }))} placeholder={t('gestione.drinkUnitsPh')} type="number" step="0.1" className="form-control" style={{ fontSize: '13px', flex: 1 }} />
                  <button onClick={addVenueDrink} disabled={addingDrink} className="btn btn-primary" style={{ borderRadius: '12px', fontSize: '13px', padding: '8px 14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <Plus size={15} /> {addingDrink ? t('gestione.drinkAdding') : t('gestione.drinkAdd')}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', lineHeight: 1.4 }}>{t('gestione.drinksHint')}</p>
              </div>
            </div>
          )}

          {/* SEZIONE: SERVIZI */}
          {tab === 'servizi' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px' }}>{t('gestione.svcTitle')}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>{t('gestione.svcSubtitle')}</p>
              {services.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>{t('gestione.svcEmpty')}</p>
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
                            <option value="">{t('gestione.svcChooseEvent')}</option>
                            {myEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                          </select>
                        )}
                        {s.code === 'sponsored_event' && myEvents.length === 0 && (
                          <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', marginBottom: '10px' }}>{t('gestione.svcNoEvents')}<Link href="/events" style={{ color: 'var(--secondary)' }}>{t('gestione.svcCreateEvent')}</Link>{t('gestione.svcCreateEventSuffix')}</p>
                        )}
                        {s.code === 'promo' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                            <input value={inp.title || ''} onChange={(e) => setInput(s.id, { title: e.target.value })} placeholder={t('gestione.svcPromoPh1')} className="form-control" style={{ fontSize: '13px' }} />
                            <textarea value={inp.body || ''} onChange={(e) => setInput(s.id, { body: e.target.value })} placeholder={t('gestione.svcPromoDesc')} rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                            <input value={inp.link || ''} onChange={(e) => setInput(s.id, { link: e.target.value })} placeholder={t('gestione.svcPromoLink')} className="form-control" style={{ fontSize: '13px' }} />
                            {/* Immagine del banner */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {inp.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={inp.image} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                              ) : null}
                              <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {uploadingFor === s.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={13} />}
                                {inp.image ? t('gestione.svcPromoImgChange') : t('gestione.svcPromoImgAdd')}
                                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPromoImage(s.id, f); }} />
                              </label>
                              {inp.image && <button type="button" onClick={() => setInput(s.id, { image: '' })} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>{t('gestione.svcPromoImgRemove')}</button>}
                            </div>
                          </div>
                        )}
                        {s.code === 'notify' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                            <textarea value={inp.message || ''} onChange={(e) => setInput(s.id, { message: e.target.value })} placeholder={t('gestione.svcNotifyPh')} rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
                            <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)' }}>{t('gestione.svcNotifyHint')}</p>
                          </div>
                        )}
                        <button onClick={() => addToCart(s)} className="btn btn-primary" style={{ width: '100%', borderRadius: '20px', padding: '10px', fontWeight: 700, fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <ShoppingCart size={15} /> {t('gestione.svcAddCart', { price: euro(price) })}
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
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShoppingCart size={18} color="var(--secondary)" /> {t('gestione.cartTitle')}</h2>
              {cart.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '16px' }}>{t('gestione.cartEmpty')}<button onClick={() => setTab('servizi')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 700 }}>{t('gestione.cartServicesLink')}</button>.</p>
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
                        <button type="button" onClick={() => removeFromCart(it.uid)} title={t('gestione.bannerDelete')} style={{ background: 'rgba(239,68,68,0.12)', border: 'none', color: '#EF4444', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-dark)' }}>
                    <span style={{ fontSize: '14px', color: '#FFF', fontWeight: 700 }}>{t('gestione.cartTotal')}</span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--secondary)' }}>{euro(cartTotal)}</span>
                  </div>
                  <button onClick={checkoutCart} disabled={paying} className="btn btn-primary" style={{ width: '100%', borderRadius: '24px', padding: '12px', fontWeight: 800, fontSize: '15px' }}>
                    {paying ? t('gestione.orderSending') : t('gestione.orderSend')}
                  </button>
                  <p style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', textAlign: 'center', marginTop: '8px', lineHeight: 1.4 }}>
                    {t('gestione.orderNote')}
                  </p>
                </>
              )}
            </div>
          )}

          {/* SEZIONE: BANNER (gestione + analytics + proroga) */}
          {tab === 'banner' && (
            <div className="card" style={{ padding: '16px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}><Megaphone size={18} color="var(--secondary)" /> {t('gestione.bannerTitle')}</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginBottom: '14px' }}>{t('gestione.bannerSubtitle')}</p>
              {banners.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>{t('gestione.bannerEmpty')}<button onClick={() => setTab('servizi')} style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontWeight: 700 }}>{t('gestione.bannerFeedLink')}</button>.</p>
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
                              {live ? t('gestione.bannerActive') : expired ? t('gestione.bannerExpired') : t('gestione.bannerInactive')}
                              {b.ends_at && ` ${t('gestione.bannerUntil', { date: new Date(b.ends_at).toLocaleDateString('it-IT') })}`}
                            </div>
                          </div>
                        </div>

                        {/* Analytics */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Eye size={13} /> {b.impressions || 0}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{t('gestione.bannerViews')}</div>
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MousePointerClick size={13} /> {b.clicks || 0}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>{t('gestione.bannerClicks')}</div>
                          </div>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--secondary)' }}>{ctr}%</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-dark-secondary)' }}>CTR</div>
                          </div>
                        </div>

                        {/* Azioni */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          <button onClick={() => openEditBanner(b)} className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Pencil size={13} /> {t('gestione.bannerEdit')}</button>
                          <button onClick={() => deleteBanner(b)} className="btn" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', border: '1px solid var(--error)', color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Trash2 size={13} /> {t('gestione.bannerDelete')}</button>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
                            <select value={extendDays[b.id] || 7} onChange={(e) => setExtendDays((p) => ({ ...p, [b.id]: Number(e.target.value) }))} className="form-control" style={{ fontSize: '12px', height: '34px', width: 'auto', padding: '4px 28px 4px 10px' }}>
                              {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d}g</option>)}
                            </select>
                            <button onClick={() => extendBanner(b)} className="btn btn-primary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><CalendarClock size={13} /> {t('gestione.bannerExtend')}</button>
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
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#FFF', marginBottom: '12px' }}>{t('gestione.ordersTitle')}</h2>
              {orders.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)', textAlign: 'center', padding: '12px' }}>{t('gestione.ordersEmpty')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {orders.map((o) => {
                    const expanded = openOrder === o.id;
                    const m = o.meta || {};
                    return (
                      <div key={o.id} style={{ borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dark)', overflow: 'hidden' }}>
                        <button type="button" onClick={() => setOpenOrder(expanded ? null : o.id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontSize: '13px', color: '#FFF', minWidth: 0 }}>{svcName[o.service_code] || o.service_code}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-dark-secondary)', whiteSpace: 'nowrap' }}>{orderLabel[o.status] || o.status} · {euro(o.amount_cents)}</span>
                        </button>
                        {expanded && (
                          <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-dark)', fontSize: '12px', color: 'var(--text-dark-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ marginTop: '8px' }}>{t('gestione.orderDate')} {new Date(o.created_at).toLocaleString('it-IT')}</div>
                            {m.title && <div>{t('gestione.orderTitleLabel')} <span style={{ color: '#FFF' }}>{m.title}</span></div>}
                            {m.message && <div>{t('gestione.orderMsg')} <span style={{ color: '#FFF' }}>{m.message}</span></div>}
                            {m.body && <div>{t('gestione.orderBody')} <span style={{ color: '#FFF' }}>{m.body}</span></div>}
                            {m.link && <div>{t('gestione.orderLink')} <span style={{ color: '#FFF' }}>{m.link}</span></div>}
                            {o.paid_at && <div>{t('gestione.orderPaidOn')} {new Date(o.paid_at).toLocaleString('it-IT')}</div>}
                            {o.status === 'pending' && (
                              <button type="button" onClick={() => cancelOrder(o)} disabled={canceling === o.id} className="btn" style={{ marginTop: '6px', alignSelf: 'flex-start', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: '16px', padding: '6px 14px', fontSize: '12px', fontWeight: 700 }}>
                                {canceling === o.id ? t('gestione.orderCanceling') : t('gestione.orderCancel')}
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
              <strong style={{ fontSize: '16px', color: '#FFF' }}>{t('gestione.bannerEditTitle')}</strong>
              <button onClick={() => setEditBanner(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dark-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <input value={bnForm.title} onChange={(e) => setBnForm((p) => ({ ...p, title: e.target.value }))} placeholder={t('gestione.bannerTitlePh')} className="form-control" style={{ fontSize: '13px' }} />
            <textarea value={bnForm.body} onChange={(e) => setBnForm((p) => ({ ...p, body: e.target.value }))} placeholder={t('gestione.bannerDescPh')} rows={2} className="form-control" style={{ fontSize: '13px', resize: 'none' }} />
            <input value={bnForm.link_url} onChange={(e) => setBnForm((p) => ({ ...p, link_url: e.target.value }))} placeholder={t('gestione.bannerLinkPh')} className="form-control" style={{ fontSize: '13px' }} />
            <input value={bnForm.cta} onChange={(e) => setBnForm((p) => ({ ...p, cta: e.target.value }))} placeholder={t('gestione.bannerCtaPh')} className="form-control" style={{ fontSize: '13px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {bnForm.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bnForm.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
              )}
              <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ImagePlus size={13} /> {bnForm.image_url ? t('gestione.bannerImgChange') : t('gestione.bannerImgAdd')}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadBannerImage(f); }} />
              </label>
              {bnForm.image_url && <button type="button" onClick={() => setBnForm((p) => ({ ...p, image_url: '' }))} style={{ background: 'none', border: 'none', color: 'var(--error)', fontSize: '12px', cursor: 'pointer' }}>{t('gestione.bannerImgRemove')}</button>}
            </div>
            <button onClick={saveBanner} disabled={savingBanner} className="btn btn-primary" style={{ borderRadius: '20px', padding: '11px', fontWeight: 700, marginTop: '4px' }}>{savingBanner ? t('gestione.bannerSaving') : t('gestione.bannerSave')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
