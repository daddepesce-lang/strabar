'use client';

import { useEffect, useState } from 'react';
import { Loader, Send, Clock, Trash2, Bell } from 'lucide-react';

const TARGETS = [
  { key: 'all', label: 'Tutti gli utenti' },
  { key: 'active7d', label: 'Attivi ultimi 7gg' },
  { key: 'premium', label: 'Solo Premium' },
];

export default function NotificationsAdmin() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ title: '', message: '', link: '', target: 'all', scheduledAt: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
      const j = await res.json();
      setCampaigns(j.campaigns || []);
    } catch { /* noop */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (action) => {
    if (!form.message.trim()) { setMsg('Scrivi un messaggio.'); return; }
    if (action === 'schedule' && !form.scheduledAt) { setMsg('Imposta data e ora per programmare.'); return; }
    if (action === 'send' && !window.confirm('Inviare SUBITO questa notifica ai destinatari selezionati?')) return;
    setBusy(true); setMsg('');
    try {
      const payload = action === 'send'
        ? { action: 'send', ...form }
        : { ...form, scheduledAt: new Date(form.scheduledAt).toISOString() };
      const res = await fetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) { setMsg('Errore: ' + (j.error || '')); return; }
      setMsg(action === 'send' ? `Inviata a ${j.recipients} utenti ✅` : 'Campagna programmata ✅');
      setForm({ title: '', message: '', link: '', target: 'all', scheduledAt: '' });
      load();
    } catch (err) { setMsg('Errore: ' + (err.message || err)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Eliminare questa campagna?')) return;
    await fetch(`/api/admin/notifications?id=${id}`, { method: 'DELETE' });
    load();
  };

  const inputStyle = { width: '100%', height: 40, fontSize: 14 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Bell size={17} color="var(--primary)" /> Nuova notifica
        </h3>
        <input className="form-control" style={inputStyle} placeholder="Titolo (opzionale, es. Aperitivo? 🍹)" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <textarea className="form-control" placeholder="Messaggio (es. È venerdì! Registra il tuo aperitivo su Strabar 🍻)" rows={2} value={form.message} onChange={(e) => set('message', e.target.value)} style={{ fontSize: 14, resize: 'vertical' }} />
        <input className="form-control" style={inputStyle} placeholder="Link (opzionale, es. /log)" value={form.link} onChange={(e) => set('link', e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label className="form-label" style={{ fontSize: 10 }}>Destinatari</label>
            <select className="form-control" style={inputStyle} value={form.target} onChange={(e) => set('target', e.target.value)}>
              {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label className="form-label" style={{ fontSize: 10 }}>Programma per (opzionale)</label>
            <input type="datetime-local" className="form-control" style={inputStyle} value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
          </div>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('Errore') ? 'var(--error)' : 'var(--success)' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => submit('send')} disabled={busy} className="btn btn-primary" style={{ borderRadius: 14, flex: 1, justifyContent: 'center', gap: 6 }}>
            {busy ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} Invia ora
          </button>
          <button onClick={() => submit('schedule')} disabled={busy} className="btn btn-secondary" style={{ borderRadius: 14, flex: 1, justifyContent: 'center', gap: 6 }}>
            <Clock size={15} /> Programma
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', margin: 0 }}>
          Le notifiche rispettano l&apos;opt-out promozionale degli utenti. <strong>Invia ora</strong> parte subito.
          Le <strong>programmate</strong> vengono spedite alla corsa giornaliera del cron (~18:00, ora dell&apos;aperitivo):
          imposta una campagna per la data desiderata e partirà a quell&apos;ora. Per orari diversi usa &quot;Invia ora&quot;.
        </p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Campagne</h3>
        {loading ? (
          <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>
        ) : campaigns.length === 0 ? (
          <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessuna campagna ancora.</p>
        ) : campaigns.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-dark)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#FFF', fontWeight: 600 }}>{c.title ? `${c.title} — ` : ''}{c.message}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginTop: 2 }}>
                {TARGETS.find((t) => t.key === c.target)?.label || c.target}
                {c.sent_at ? ` · inviata a ${c.recipients} il ${new Date(c.sent_at).toLocaleString('it-IT')}` : c.scheduled_at ? ` · programmata per ${new Date(c.scheduled_at).toLocaleString('it-IT')}` : ' · bozza'}
              </div>
            </div>
            <button onClick={() => remove(c.id)} className="action-btn" title="Elimina" style={{ color: 'var(--error)', flexShrink: 0 }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
