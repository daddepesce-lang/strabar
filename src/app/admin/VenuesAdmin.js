'use client';

import { useEffect, useState } from 'react';
import { Loader, Search, MapPin, Users, Beer, Clock, Repeat, ChevronDown, TrendingUp, BadgeCheck, GitMerge, Pencil } from 'lucide-react';

const fmtAgo = (d) => {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 30) return `${days}g fa`;
  return `${Math.floor(days / 30)} mesi fa`;
};

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const peakWindow = (h) => `${hourLabel(h)}–${hourLabel((h + 2) % 24)}`;

export default function VenuesAdmin() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/venues', { cache: 'no-store' });
      setData(await res.json());
    } catch { setData({ venues: [] }); }
  };
  useEffect(() => { load(); }, []);

  const post = async (body) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/venues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Errore'); return null; }
      await load();
      return d;
    } finally { setBusy(false); }
  };

  const toggleVerify = (v) => post({ action: 'verify', key: v.key, name: v.name, lat: v.lat, lng: v.lng, verified: !v.verified });
  const rename = async (v) => {
    const toName = prompt('Nuovo nome canonico del locale:', v.name);
    if (!toName || !toName.trim() || toName.trim() === v.name) return;
    const r = await post({ action: 'rename', fromKey: v.key, toName: toName.trim() });
    if (r) alert(`Rinominato. Sessioni aggiornate: ${r.sessionsUpdated}.`);
  };
  const merge = async (v) => {
    const toName = prompt(`Unisci "${v.name}" in un altro locale.\nScrivi il NOME canonico di destinazione (le sessioni di "${v.name}" verranno spostate lì):`);
    if (!toName || !toName.trim()) return;
    if (!confirm(`Confermi? Tutte le ${v.sessions} presenze di "${v.name}" passeranno a "${toName.trim()}". L'operazione riscrive le sessioni.`)) return;
    const r = await post({ action: 'merge', fromKey: v.key, toName: toName.trim() });
    if (r) alert(`Unito. Sessioni spostate: ${r.sessionsUpdated}.`);
  };

  if (!data) return <div style={{ color: 'var(--text-dark-secondary)' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carico…</div>;

  const s = q.toLowerCase().trim();
  const venues = (data.venues || []).filter((v) => !s || v.name.toLowerCase().includes(s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <TrendingUp size={17} color="var(--primary)" /> Statistiche bar
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-dark-secondary)', margin: 0, lineHeight: 1.5 }}>
          Presenze, clienti, drink e fasce orarie per ogni locale — la base per vendere pubblicità mirata.
          {' '}<strong>{data.totalVenues || 0}</strong> locali · <strong>{data.totalGeoSessions || 0}</strong> check-in geolocalizzati.
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-dark-secondary)', margin: '2px 0 0', opacity: 0.8 }}>
          ⚠️ Dati aggregati e anonimi: vendibili liberamente. Le campagne ai clienti restano soggette al consenso commerciale.
        </p>
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dark-secondary)' }} />
        <input className="form-control" placeholder="Cerca un locale…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36, fontSize: 14 }} />
      </div>

      {venues.length === 0 ? (
        <p style={{ color: 'var(--text-dark-secondary)', fontSize: 13 }}>Nessun locale trovato.</p>
      ) : venues.map((v) => {
        const isOpen = open === v.name;
        const maxHour = Math.max(1, ...v.hours);
        return (
          <div key={v.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : v.name)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 16, textAlign: 'left', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} color="var(--primary)" /> {v.name}
                  {v.verified && <BadgeCheck size={15} color="var(--secondary)" title="Verificato" />}
                  {v.claimed && <span title="Ha un gestore" style={{ fontSize: 11 }}>🔧</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dark-secondary)', marginTop: 3 }}>
                  {v.sessions} presenze · {v.uniqueUsers} clienti · picco {peakWindow(v.peakHour)} · {v.topDay}
                </div>
              </div>
              <ChevronDown size={16} style={{ color: 'var(--text-dark-secondary)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Governance: verifica, rinomina, unisci doppioni */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" disabled={busy} onClick={() => toggleVerify(v)} className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 12px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 5, color: v.verified ? 'var(--secondary)' : undefined }}>
                    <BadgeCheck size={14} /> {v.verified ? 'Verificato (togli)' : 'Verifica'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => rename(v)} className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 12px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Pencil size={14} /> Rinomina
                  </button>
                  <button type="button" disabled={busy} onClick={() => merge(v)} className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 12px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <GitMerge size={14} /> Unisci a…
                  </button>
                </div>

                {/* KPI */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                  {[
                    { icon: <Users size={14} />, label: 'Clienti unici', val: v.uniqueUsers },
                    { icon: <Repeat size={14} />, label: 'Clienti abituali', val: `${v.repeatUsers} (${v.repeatRate}%)` },
                    { icon: <Beer size={14} />, label: 'Drink totali', val: v.drinkCount },
                    { icon: <TrendingUp size={14} />, label: 'U.A. medie/visita', val: v.avgUnits },
                  ].map((k, i) => (
                    <div key={i} style={{ background: 'var(--bg-input-dark)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dark-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>{k.icon}{k.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>{k.val}</div>
                    </div>
                  ))}
                </div>

                {/* Drink più ordinati */}
                {v.topDrinks.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Beer size={13} /> Drink più ordinati</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {v.topDrinks.map((d) => (
                        <span key={d.name} style={{ fontSize: 12, background: 'var(--bg-input-dark)', border: '1px solid var(--border-dark)', borderRadius: 14, padding: '4px 10px', color: '#FFF' }}>
                          {d.name} <strong style={{ color: 'var(--primary)' }}>×{d.qty}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fasce orarie */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={13} /> Fasce orarie (drink registrati)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                    {v.hours.map((h, i) => (
                      <div key={i} title={`${hourLabel(i)} · ${h}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                        <div style={{ height: `${(h / maxHour) * 100}%`, background: i === v.peakHour ? 'var(--primary)' : 'rgba(255,255,255,0.18)', borderRadius: '2px 2px 0 0', minHeight: h > 0 ? 2 : 0 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dark-secondary)', marginTop: 2 }}>
                    <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
                  </div>
                </div>

                {/* Pitch pronto da vendere */}
                <div style={{ background: 'rgba(255,32,0,0.08)', border: '1px solid rgba(255,32,0,0.25)', borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-dark-primary)' }}>
                  💬 <strong>Pitch:</strong> &ldquo;Il {v.topDay} è il tuo giorno migliore: {v.uniqueUsers} clienti registrano le loro bevute da te, picco tra le {peakWindow(v.peakHour)}.
                  {v.topDrinks[0] ? ` Il drink più ordinato è ${v.topDrinks[0].name}.` : ''}
                  {v.repeatRate >= 30 ? ` Il ${v.repeatRate}% torna più volte.` : ''}
                  {' '}Vuoi una notifica sponsorizzata per chi è in zona nel tuo orario di punta?&rdquo;
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-dark-secondary)' }}>Ultima presenza: {fmtAgo(v.lastSeen)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
