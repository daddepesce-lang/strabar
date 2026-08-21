// Notifiche in-app (toast) chiamabili da QUALSIASI punto del codice, anche fuori da un
// componente React. Sostituisce `alert()`:
//   • `alert()` in una WebView Capacitor esce come dialog di SISTEMA col nome del dominio
//     ("strabar.app dice:") → sembra un errore del browser, non l'app;
//   • blocca il thread: niente animazioni, niente tap, e su iOS a volte resta appeso;
//   • non è traducibile senza passare dal dizionario, ed è per questo che erano rimaste
//     decine di stringhe italiane dentro un'app in 4 lingue.
//
// L'host (<ToastHost/> in layout.js) è montato UNA volta sopra a tutte le pagine: il toast
// sopravvive anche a un cambio di rotta subito dopo (es. "salvato!" + router.push).
//
// Uso:
//   import { showToast, showError } from '@/lib/toast';
//   showToast(t('session.saved'));                        // successo
//   showError(t('errors.cannotAddDrink'), err);           // errore (dettaglio in console)

const EVENT = 'strabar-toast';

// Coda per i toast emessi PRIMA che l'host sia montato (es. durante il primo render).
const pending = [];
let hostReady = false;

function emit(detail) {
  if (typeof window === 'undefined') return;
  if (!hostReady) { pending.push(detail); return; }
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

// Chiamata dall'host quando è pronto: svuota la coda.
export function attachToastHost(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (e) => handler(e.detail);
  window.addEventListener(EVENT, listener);
  hostReady = true;
  const queued = pending.splice(0, pending.length);
  queued.forEach((d) => handler(d));
  return () => {
    window.removeEventListener(EVENT, listener);
    hostReady = false;
  };
}

// message obbligatorio; title opzionale; variant: 'success' | 'warning' | 'info' | 'error'.
export function showToast(message, { variant = 'success', title, duration } = {}) {
  if (!message) return;
  emit({ message: String(message), variant, title, duration });
}

// Errori: toast rosso + dettaglio tecnico in console (che l'utente non deve leggere).
// `err` è opzionale e NON viene mostrato: i messaggi di Postgres/Supabase non sono
// spiegazioni utili per chi sta bevendo una birra.
export function showError(message, err) {
  if (err) console.error(message, err);
  emit({ message: String(message), variant: 'error', duration: 4200 });
}
