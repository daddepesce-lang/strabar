'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Loader, Store, ChevronRight } from 'lucide-react';

// "I miei locali": elenco dei locali che gestisco (claim approvati). Se ne ho uno solo
// rimando direttamente alla sua gestione; se nessuno, alla pagina "Sei un locale?".
export default function MyVenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const claims = await db.getMyVenueClaims().catch(() => []);
      if (cancelled) return;
      const seen = new Set();
      const list = [];
      (claims || []).filter((c) => c.status === 'approved').forEach((c) => {
        if (!seen.has(c.venue_key)) { seen.add(c.venue_key); list.push({ key: c.venue_key, name: c.venue_name || c.venue_key }); }
      });
      if (list.length === 1) { router.replace(`/locale/${encodeURIComponent(list[0].key)}/gestione`); return; }
      if (list.length === 0) { router.replace('/business'); return; }
      setVenues(list);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!venues) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader size={30} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>;
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <div style={{ fontSize: '12px', color: 'var(--secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Area locale</div>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#FFF' }}>I miei locali</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-dark-secondary)' }}>Scegli quale locale gestire.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {venues.map((v) => (
          <Link key={v.key} href={`/locale/${encodeURIComponent(v.key)}/gestione`} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,32,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Store size={20} color="var(--primary)" />
            </div>
            <strong style={{ flex: 1, fontSize: '15px', color: '#FFF' }}>{v.name}</strong>
            <ChevronRight size={18} color="var(--text-dark-secondary)" />
          </Link>
        ))}
      </div>
    </div>
  );
}
