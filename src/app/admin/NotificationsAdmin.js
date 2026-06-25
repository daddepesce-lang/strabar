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
  const [form, setForm] = useState({ title: '', message: '', link: '', target: 'all', scheduledAt: '', repeat: 'none', kind: 'commercial' });
  const [cfg, setCfg] = useState(null);
  const [cfgMsg, setCfgMsg] = useState('');

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/admin/config', { cache: 'no-store' });
      const j = await res.json();
      setCfg(j.config || { push_reminder_enabled: true, push_reminder_every: 3 });
    } catch { setCfg({ push_reminder_enabled: true, push_reminder_every: 3 }); }
  };
  const saveConfig = async (patch) => {
    setCfgMsg('');
    const next = { ...cfg, ...patch };
    setCfg(next);
    try {
      const res = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await res.json();
      if (!res.ok) { setCfgMsg('Errore: ' + (j.error || '')); return; }
      setCfg(j.config); setCfgMsg('Salvato ✅');
      setTimeout(() => setCfgMsg(''), 2000);
    } catch (err) { setCfgMsg('Errore: ' + (err.message || err)); }
  };
  useEffect(() => { loadConfig(); }, []);

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
      setForm({ title: '', message: '', link: '', target: 'all', scheduledAt: '', repeat: 'none', kind: 'commercial' });
      load();
    } catch (err) { setMsg('Errore: ' + (err.message || err)); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Eliminare questa campagna?')) return;
    await fetch(`/api/admin/notifications?id=${id}`, { method: 'DELETE' });
    load();
  };

  // Niente height fissa: i <select> nativi iOS taglierebbero il testo. Lasciamo
  // che padding/line-height di .form-control diano l'altezza naturale.
  const inputStyle = { width: '100%', fontSize: 14 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Promemoria "attiva le notifiche" */}
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Bell size={17} color="var(--secondary)" /> Promemoria attivazione notifiche
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: 0 }}>
          Agli utenti che NON hanno attivato le notifiche, ogni tot aperture dell&apos;app mostriamo un invito ad attivarle.
          Il controllo avviene sul dispositivo (costo Supabase ~zero). L&apos;utente può scegliere di non vederli più.
        </p>
        {!cfg ? (
          <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => saveConfig({ push_reminder_enabled: !cfg.push_reminder_enabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#FFF', fontSize: 13, fontWeight: 600 }}>
              <span>Promemoria {cfg.push_reminder_enabled ? 'attivi' : 'disattivati'}</span>
              <span style={{ width: 44, height: 24, borderRadius: 12, position: 'relative', background: cfg.push_reminder_enabled ? 'var(--primary)' : 'rgba(255,255,255,0.15)' }}>
                <span style={{ position: 'absolute', top: 2, left: cfg.push_reminder_enabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-dark-secondary)' }}>Ogni</span>
              <input type="number" min={1} max={50} value={cfg.push_reminder_every}
                onChange={(e) => setCfg({ ...cfg, push_reminder_every: e.target.value })}
                onBlur={(e) => saveConfig({ push_reminder_every: e.target.value })}
                className="form-control" style={{ width: 70, height: 38, fontSize: 14, textAlign: 'center' }} />
              <span style={{ fontSize: 13, color: 'var(--text-dark-secondary)' }}>aperture</span>
            </div>
            {cfgMsg && <span style={{ fontSize: 12, color: cfgMsg.startsWith('Errore') ? 'var(--error)' : 'var(--success)' }}>{cfgMsg}</span>}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Bell size={17} color="var(--primary)" /> Nuova notifica
        </h3>
        <input className="form-control" style={inputStyle} placeholder="Titolo (opzionale, es. Aperitivo? 🍹)" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <textarea className="form-control" placeholder="Messaggio (es. È venerdì! Registra il tuo aperitivo su Strabar 🍻)" rows={2} value={form.message} onChange={(e) => set('message', e.target.value)} style={{ fontSize: 14, resize: 'vertical' }} />
        <input className="form-control" style={inputStyle} placeholder="Link (opzionale, es. /log)" value={form.link} onChange={(e) => set('link', e.target.value)} />

        {/* Tipo di campagna: determina chi la riceve (consenso marketing o no) */}
        <div>
          <label className="form-label" style={{ fontSize: 10 }}>Tipo di notifica</label>
          <select className="form-control" style={inputStyle} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="commercial">Offerta commerciale (promo, sconti, partner)</option>
            <option value="service">Comunicazione di servizio (manutenzione, sicurezza, novità app)</option>
          </select>
          <div style={{
            fontSize: 11, lineHeight: 1.5, marginTop: 6, padding: '8px 10px', borderRadius: 8,
            background: form.kind === 'commercial' ? 'rgba(255,32,0,0.08)' : 'rgba(16,185,129,0.08)',
            border: `1px solid ${form.kind === 'commercial' ? 'rgba(255,32,0,0.25)' : 'rgba(16,185,129,0.25)'}`,
            color: 'var(--text-dark-secondary)',
          }}>
            {form.kind === 'commercial' ? (
              <>📣 <strong>Solo agli utenti che hanno dato il consenso marketing.</strong> Usalo per offerte, promozioni e contenuti dei locali partner.</>
            ) : (
              <>🛠️ <strong>A tutti gli utenti del target</strong>, anche senza consenso marketing. Usalo <strong>solo</strong> per comunicazioni di servizio reali (manutenzione, sicurezza, account, novità funzionali). Non inserirci contenuti commerciali: sarebbe una violazione.</>
            )}
          </div>
        </div>

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
          <div style={{ flex: '1 1 160px' }}>
            <label className="form-label" style={{ fontSize: 10 }}>Ricorrenza</label>
            <select className="form-control" style={inputStyle} value={form.repeat} onChange={(e) => set('repeat', e.target.value)}>
              <option value="none">Una volta</option>
              <option value="daily">Ogni giorno</option>
              <option value="weekly">Ogni settimana</option>
              <option value="monthly">Ogni mese</option>
            </select>
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
          Le campagne <strong>commerciali</strong> arrivano solo a chi ha dato il consenso marketing; quelle <strong>di servizio</strong> a tutti. <strong>Invia ora</strong> parte subito.
          Le <strong>programmate</strong> partono alla corsa giornaliera del cron (~18:00). Scegli la <strong>ricorrenza</strong>:
          <em>Non si ripete</em> = parte una volta sola alla data scelta; <em>Ogni settimana</em> = si ripete ogni settimana nello stesso giorno. Per orari diversi usa &quot;Invia ora&quot;.
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
                {c.kind === 'service' ? '🛠️ Servizio' : '📣 Commerciale'}
                {' · '}{TARGETS.find((t) => t.key === c.target)?.label || c.target}
                {c.repeat && c.repeat !== 'none' ? ` · 🔁 ${({ daily: 'ogni giorno', weekly: 'ogni settimana', monthly: 'ogni mese' })[c.repeat] || c.repeat}` : ''}
                {c.sent_at ? ` · inviata a ${c.recipients} il ${new Date(c.sent_at).toLocaleString('it-IT')}` : c.scheduled_at ? ` · ${c.repeat && c.repeat !== 'none' ? 'prossimo invio' : 'programmata per'} ${new Date(c.scheduled_at).toLocaleString('it-IT')}` : ' · bozza'}
              </div>
            </div>
            <button onClick={() => remove(c.id)} className="action-btn" title="Elimina" style={{ color: 'var(--error)', flexShrink: 0 }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
