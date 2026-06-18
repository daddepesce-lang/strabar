import Link from 'next/link';

export const metadata = {
  title: 'Termini di Servizio | Strabar',
};

// NOTA: questo è un modello base da personalizzare. NON è consulenza legale.
// Sostituisci i campi tra [parentesi] con i tuoi dati prima della pubblicazione.
const CONTACT_EMAIL = 'pesce.davide1995@gmail.com';
const APP_NAME = 'Strabar';
const LAST_UPDATE = '18 giugno 2026';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', lineHeight: 1.6 }}>
      <Link href="/" style={{ color: 'var(--text-dark-secondary)', fontSize: '14px' }}>← Torna a {APP_NAME}</Link>
      <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '16px 0 4px' }}>Termini di Servizio</h1>
      <p style={{ color: 'var(--text-dark-secondary)', fontSize: '13px', marginBottom: '24px' }}>Ultimo aggiornamento: {LAST_UPDATE}</p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '15px', color: 'var(--text-dark-primary)' }}>
        <section>
          <h2 style={s.h2}>1. Cos&apos;è {APP_NAME}</h2>
          <p>{APP_NAME} è un&apos;applicazione <strong>gratuita e amatoriale</strong> che permette di registrare in modo ludico le proprie consumazioni, taggare amici, fare check-in nei locali e confrontarsi in classifiche. È offerta &quot;così com&apos;è&quot;, senza scopo di lucro e senza alcuna garanzia.</p>
        </section>

        <section>
          <h2 style={s.h2}>2. Età minima (18+)</h2>
          <p>Il servizio tratta contenuti relativi al consumo di alcol ed è riservato esclusivamente a utenti <strong>maggiorenni (18+)</strong>. Registrandoti dichiari di avere almeno 18 anni. Se sei minorenne non puoi utilizzare {APP_NAME}.</p>
        </section>

        <section>
          <h2 style={s.h2}>3. Consumo responsabile e niente consigli medici</h2>
          <p>I valori di tasso alcolemico (BAC), unità alcoliche e &quot;curva d&apos;ebbrezza&quot; mostrati sono <strong>stime puramente indicative</strong>, calcolate con formule semplificate (Widmark) e <strong>non hanno alcun valore medico o legale</strong>. Non devono mai essere usati per decidere se metterti alla guida o per valutare il tuo stato psicofisico. Bevi responsabilmente: <strong>se bevi non guidare</strong>.</p>
        </section>

        <section>
          <h2 style={s.h2}>4. Account e contenuti degli utenti</h2>
          <p>Sei responsabile delle informazioni del tuo account e dei contenuti che pubblichi (testi, foto, tag). Pubblicando dichiari di averne il diritto e di non violare diritti di terzi. È vietato caricare contenuti illegali, offensivi, o che ritraggano persone senza il loro consenso.</p>
        </section>

        <section>
          <h2 style={s.h2}>5. Tag di altre persone</h2>
          <p>Quando tagghi qualcuno, fallo solo se sei autorizzato. Chiunque può chiedere la rimozione di un tag o di un contenuto che lo riguarda scrivendo a {CONTACT_EMAIL}.</p>
        </section>

        <section>
          <h2 style={s.h2}>6. Uso accettabile</h2>
          <p>Non è consentito usare il servizio per scopi illeciti, tentare di comprometterne la sicurezza, fare scraping massivo o sovraccaricare i servizi di terze parti (es. mappe). Possiamo sospendere account che violano questi termini.</p>
        </section>

        <section>
          <h2 style={s.h2}>7. Servizi di terze parti</h2>
          <p>{APP_NAME} si appoggia a servizi di terzi (es. <strong>Supabase</strong> per autenticazione e database, <strong>OpenStreetMap</strong> per la ricerca dei locali). L&apos;uso di tali servizi è soggetto ai rispettivi termini.</p>
        </section>

        <section>
          <h2 style={s.h2}>8. Marchi</h2>
          <p>{APP_NAME} è un progetto indipendente e <strong>non è affiliato, sponsorizzato o approvato</strong> da alcun altro marchio o applicazione. I marchi citati appartengono ai rispettivi titolari.</p>
        </section>

        <section>
          <h2 style={s.h2}>9. Limitazione di responsabilità</h2>
          <p>Nei limiti consentiti dalla legge, l&apos;autore di {APP_NAME} non è responsabile per danni derivanti dall&apos;uso dell&apos;app, incluse decisioni prese sulla base delle stime mostrate. Usi il servizio a tuo rischio.</p>
        </section>

        <section>
          <h2 style={s.h2}>10. Modifiche</h2>
          <p>Questi termini possono essere aggiornati. L&apos;uso continuato dopo le modifiche ne implica l&apos;accettazione.</p>
        </section>

        <section>
          <h2 style={s.h2}>11. Contatti</h2>
          <p>Per qualsiasi richiesta: <strong>{CONTACT_EMAIL}</strong>.</p>
        </section>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', marginTop: '20px' }}>
        Bevi responsabilmente. 18+. Se bevi non guidare. 🍻
      </p>
    </div>
  );
}

const s = {
  h2: { fontSize: '17px', fontWeight: 800, marginBottom: '6px', color: '#FFF' },
};
