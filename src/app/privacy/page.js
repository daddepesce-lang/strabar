import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Strabar',
};

// NOTA: modello base conforme all'impostazione GDPR, da personalizzare.
// NON è consulenza legale. Sostituisci i campi tra [parentesi].
const CONTACT_EMAIL = 'pesce.davide1995@gmail.com';
const OWNER = 'Davide Pesce, persona fisica (progetto non commerciale)';
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
            <li><strong>Posizione:</strong> la tua posizione GPS viene usata <strong>solo al momento</strong> in cui avvii un check-in geolocalizzato (per trovare i locali vicini), usi il <strong>Radar Live</strong> o avanzi a una tappa di un <strong>Tour guidato</strong> (per verificare che tu sia effettivamente sul posto). Non tracciamo la tua posizione in background.</li>
            <li><strong>Verifica posizione nelle tappe:</strong> quando avanzi da una tappa all&apos;altra di un itinerario, il GPS viene usato per confrontare la tua posizione con le coordinate della tappa. Se sei lontano (&gt;300 m) vieni avvisato e la tappa può essere segnata come &quot;non verificata&quot;, il che esclude quella registrazione dalle classifiche. La posizione rilevata non viene inviata a server esterni né salvata — serve solo al confronto locale.</li>
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
          <p style={{ marginTop: '10px' }}>Per gli <strong>eventi</strong> controlli separatamente <strong>due cose distinte</strong>:</p>
          <ul style={s.ul}>
            <li><strong>Chi lo vede nella lista eventi</strong> (solo scoperta passiva): <strong>🌍 Tutti</strong>, <strong>👥 Amici</strong> (chi è collegato a te da un follow) oppure <strong>🔒 Nessuno</strong> (non compare in lista: lo vedono solo te e le persone che inviti per nome).</li>
            <li><strong>Link di invito</strong> (interruttore on/off): quando è attivo, ogni evento ha un link con un codice e <strong>chiunque riceva quel link può aprire e partecipare</strong> — anche se l&apos;evento non compare nella lista e anche senza un account. In pratica, per l&apos;organizzatore <em>chi ha il link è un invitato</em>. Se disattivi il link, accedono solo tu e le persone invitate per nome, e un link inoltrato non funziona.</li>
          </ul>
          <p style={{ marginTop: '10px' }}>Condividi il link solo con le persone che vuoi davvero far entrare. Gli <strong>itinerari (tour)</strong> hanno invece la classica visibilità per-elemento (🌍 pubblico / 👥 amici / 🔒 privato) e non hanno un link-invito separato.</p>
          <p style={{ marginTop: '10px' }}>Gli eventi e gli itinerari creati prima dell&apos;introduzione di questi controlli restano <strong>pubblici</strong> come in precedenza, ma il proprietario può modificarne la visibilità in qualsiasi momento dalle rispettive schermate. Un evento può includere un itinerario: se l&apos;itinerario è del <strong>proprietario dell&apos;evento</strong>, le sue tappe vengono mostrate <strong>dentro l&apos;evento</strong> seguendo la privacy dell&apos;evento (e restano fuori dalla lista pubblica dei tour). Puoi collegare a un evento solo i tuoi itinerari o quelli pubblici.</p>
        </section>

        <section>
          <h2 style={s.h2}>A chi comunichiamo i dati (responsabili)</h2>
          <ul style={s.ul}>
            <li><strong>Supabase</strong> (autenticazione, database) — fornitore dell&apos;infrastruttura.</li>
            <li><strong>Cloudflare R2</strong> — archiviazione delle foto e dei file multimediali che carichi. Le immagini sono ospitate su Cloudflare e raggiungibili tramite URL pubblico.</li>
            <li><strong>Vercel</strong> — hosting dell&apos;applicazione web.</li>
            <li><strong>Google Maps Platform (Places API)</strong> — quando cerchi un locale o carichi i bar vicini, la query testuale e le coordinate approssimative vengono inviate ai server di Google per ottenere i risultati. Si applicano le <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>norme sulla privacy di Google</a>.</li>
            <li><strong>OpenStreetMap / Nominatim / Overpass API</strong> — usati come alternativa per la ricerca dei locali e per le mappe degli itinerari: la query testuale e le coordinate approssimative vengono inviate ai loro server per ottenere i risultati.</li>
            <li><strong>OSRM (Project OSRM)</strong> — per il calcolo del percorso stradale tra le tappe di un itinerario, le coordinate dei punti vengono inviate al server pubblico <em>router.project-osrm.org</em>.</li>
            <li><strong>Google Maps</strong> — quando usi il pulsante &quot;Guidami&quot; o &quot;Naviga&quot;, l&apos;app apre l&apos;app di Google Maps nel tuo dispositivo trasmettendo le coordinate della destinazione. Si applicano le <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>norme sulla privacy di Google</a>.</li>
            <li><strong>Resend</strong> — per l&apos;invio di email transazionali (es. reset password). Viene trasmesso solo l&apos;indirizzo email del destinatario.</li>
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
