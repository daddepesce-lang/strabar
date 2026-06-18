import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Strabar',
};

// NOTA: modello base conforme all'impostazione GDPR, da personalizzare.
// NON è consulenza legale. Sostituisci i campi tra [parentesi].
const CONTACT_EMAIL = '[la-tua-email@esempio.com]';
const OWNER = '[Nome Cognome], persona fisica (progetto non commerciale)';
const APP_NAME = 'Strabar';
const LAST_UPDATE = '18 giugno 2026';

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', lineHeight: 1.6 }}>
      <Link href="/" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>← Torna a {APP_NAME}</Link>
      <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '16px 0 4px' }}>Privacy Policy</h1>
      <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', marginBottom: '24px' }}>Ultimo aggiornamento: {LAST_UPDATE}</p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '15px', color: 'var(--text-dark-primary)' }}>
        <section>
          <h2 style={s.h2}>Titolare del trattamento</h2>
          <p>Il titolare è {OWNER}. Per qualsiasi richiesta sui tuoi dati: <strong>{CONTACT_EMAIL}</strong>.</p>
        </section>

        <section>
          <h2 style={s.h2}>Quali dati raccogliamo</h2>
          <ul style={s.ul}>
            <li><strong>Dati account:</strong> email, username, nome visualizzato (e, se lo inserisci, il peso corporeo per stimare il BAC).</li>
            <li><strong>Contenuti che crei:</strong> sessioni/bevute, drink, note, foto caricate, tag di amici, commenti, &quot;cheers&quot;, recensioni, eventi.</li>
            <li><strong>Posizione:</strong> la tua posizione GPS viene usata <strong>solo al momento</strong> in cui avvii un check-in geolocalizzato (per trovare i locali vicini) o usi il <strong>Radar Live</strong>. Non tracciamo la tua posizione in background.</li>
            <li><strong>Condivisione posizione live (Radar):</strong> è <strong>opt-in</strong>. Solo se scegli &quot;Amici&quot; o &quot;Tutti&quot; quando avvii un brindisi, la posizione di quel locale/sessione diventa visibile (rispettivamente ai tuoi follower o a tutti gli utenti) finché la sessione è attiva. Di default (&quot;Nessuno&quot;) non sei visibile sulla mappa.</li>
            <li><strong>Dati tecnici minimi</strong> necessari al funzionamento (es. cookie di sessione per l&apos;autenticazione).</li>
          </ul>
        </section>

        <section>
          <h2 style={s.h2}>Perché li trattiamo e base giuridica</h2>
          <ul style={s.ul}>
            <li>Per fornirti il servizio e le sue funzioni social (<strong>esecuzione del servizio</strong>).</li>
            <li>Per la posizione e le notifiche, sulla base del tuo <strong>consenso</strong> (puoi negarlo o revocarlo dalle impostazioni del browser/telefono).</li>
          </ul>
        </section>

        <section>
          <h2 style={s.h2}>Visibilità dei contenuti</h2>
          <p>{APP_NAME} è un social: profilo, sessioni, classifiche, commenti e &quot;cheers&quot; sono <strong>visibili agli altri utenti</strong>. Non pubblicare ciò che vuoi mantenere privato.</p>
        </section>

        <section>
          <h2 style={s.h2}>A chi comunichiamo i dati (responsabili)</h2>
          <ul style={s.ul}>
            <li><strong>Supabase</strong> (autenticazione, database, archiviazione foto) — fornitore dell&apos;infrastruttura.</li>
            <li><strong>OpenStreetMap / Nominatim / Overpass</strong> — quando cerchi un locale, la query e le coordinate approssimative vengono inviate per ottenere i risultati.</li>
            <li>Eventuale hosting (es. la piattaforma su cui è pubblicata l&apos;app).</li>
          </ul>
          <p>Non vendiamo i tuoi dati a terzi.</p>
        </section>

        <section>
          <h2 style={s.h2}>Conservazione</h2>
          <p>Conserviamo i dati finché mantieni l&apos;account. Puoi chiedere la cancellazione in qualsiasi momento.</p>
        </section>

        <section>
          <h2 style={s.h2}>I tuoi diritti (GDPR)</h2>
          <p>Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità dei tuoi dati, oltre a revocare il consenso. Per esercitarli scrivi a <strong>{CONTACT_EMAIL}</strong>. Puoi inoltre proporre reclamo al Garante per la protezione dei dati personali.</p>
        </section>

        <section>
          <h2 style={s.h2}>Minori</h2>
          <p>Il servizio è riservato ai maggiorenni (18+) e non è destinato a minori. Non raccogliamo consapevolmente dati di minori.</p>
        </section>

        <section>
          <h2 style={s.h2}>Modifiche</h2>
          <p>Questa informativa può essere aggiornata; pubblicheremo qui la versione corrente con la data di aggiornamento.</p>
        </section>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '20px' }}>
        Bevi responsabilmente. 18+. 🍻
      </p>
    </div>
  );
}

const s = {
  h2: { fontSize: '17px', fontWeight: 800, marginBottom: '6px', color: '#FFF' },
  ul: { margin: '6px 0 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' },
};
