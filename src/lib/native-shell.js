// Comportamenti nativi dell'app Android/iOS. Questo modulo viene caricato SOLO dentro il
// guscio Capacitor (import dinamico da src/components/NativeShell.js): sul web non arriva mai.
//
// Cosa fa:
//  - marca il documento come nativo (`<html data-native="android|ios">`) per CSS e componenti;
//  - mappa la safe area di Android sulle variabili --sa-* usate da globals.css;
//  - chiude lo splash quando la pagina remota è pronta;
//  - apre i deep link (App Links / Universal Links) come normali navigazioni dell'app;
//  - gestisce il tasto indietro di Android;
//  - registra il token push nativo (FCM/APNs) e porta l'utente alla pagina giusta al tap.

import { isNative, nativePlatform, nativePlugin, nativePushPermission } from './native';

const SITE_HOSTS = new Set(['strabar.app', 'www.strabar.app']);

/**
 * Avvia il guscio. Ritorna una funzione di cleanup.
 * @param {{ navigate: (path: string) => void }} opts
 */
export function startNativeShell({ navigate }) {
  if (!isNative()) return () => {};

  const platform = nativePlatform();
  const listeners = [];
  const track = (handle) => {
    listeners.push(handle);
    return handle;
  };

  document.documentElement.dataset.native = platform || 'unknown';

  // Android: Capacitor misura le barre di sistema e scrive --safe-area-inset-*; le nostre
  // regole leggono --sa-* (in stile inline, quindi vincono su qualunque foglio di stile).
  if (platform === 'android') {
    const root = document.documentElement.style;
    root.setProperty('--sa-top', 'var(--safe-area-inset-top, 0px)');
    root.setProperty('--sa-right', 'var(--safe-area-inset-right, 0px)');
    root.setProperty('--sa-bottom', 'var(--safe-area-inset-bottom, 0px)');
    root.setProperty('--sa-left', 'var(--safe-area-inset-left, 0px)');
  }

  // --- Splash ---------------------------------------------------------------
  const splash = nativePlugin('SplashScreen');
  if (splash) splash.hide({ fadeOutDuration: 200 }).catch(() => {});

  // --- Deep link ------------------------------------------------------------
  const app = nativePlugin('App');
  if (app) {
    track(
      app.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url);
          // Link a strabar.app → navighiamo dentro l'app senza ricaricare la WebView.
          if (SITE_HOSTS.has(parsed.host)) {
            navigate(`${parsed.pathname}${parsed.search}${parsed.hash}` || '/');
          }
        } catch {
          /* URL non parsabile: lo ignoriamo, meglio che aprire una schermata bianca */
        }
      })
    );

    // Tasto indietro di Android: torna nella history della WebView; se non c'è più nulla
    // dietro, chiudi l'app (comportamento atteso su Android, dove il back esce dall'app).
    track(
      app.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && window.history.length > 1) window.history.back();
        else app.exitApp();
      })
    );
  }

  // --- Notifiche push -------------------------------------------------------
  const push = nativePlugin('PushNotifications');
  if (push) {
    // Tap sulla notifica: `url` arriva dal payload costruito dalla Edge Function send-push.
    track(
      push.addListener('pushNotificationActionPerformed', (action) => {
        const url = action?.notification?.data?.url;
        if (!url) return;
        try {
          const parsed = new URL(url, 'https://strabar.app');
          navigate(`${parsed.pathname}${parsed.search}${parsed.hash}` || '/');
        } catch {
          navigate('/');
        }
      })
    );

    // Il token può cambiare (reinstallazione, ripristino, rotazione FCM): ogni volta che
    // arriva lo riallineiamo sul DB. La scrittura è deduplicata lato db.js, quindi in
    // regime normale questo non costa nulla.
    track(
      push.addListener('registration', (t) => {
        if (t?.value) saveToken(t.value);
      })
    );

    // Avvio a freddo: se il permesso c'è già, ci ri-registriamo per tenere il token fresco.
    // Se non c'è, NON chiediamo nulla qui: il permesso lo chiede PushReminderGate al momento
    // giusto, come sul web.
    nativePushPermission()
      .then((perm) => {
        if (perm === 'granted') push.register().catch(() => {});
      })
      .catch(() => {});

    // Canale Android dedicato alla notifica LIVE (quella che si aggiorna in place durante la
    // sessione). Importanza LOW = compare nella tenda senza suono né vibrazione a ogni
    // aggiornamento: è il comportamento che ha oggi la PWA con `renotify: false`.
    // Le altre notifiche restano sul canale di default, con suono.
    if (platform === 'android') {
      push
        .createChannel?.({
          id: 'strabar-live',
          name: 'Sessione live',
          description: 'Aggiornamenti della sessione in corso (unità, tasso, minuti)',
          importance: 2,
          visibility: 1,
          vibration: false,
        })
        ?.catch?.(() => {});
    }

    // iOS mostra il pallino sull'icona: azzeralo quando l'utente apre l'app.
    push.removeAllDeliveredNotifications?.()?.catch?.(() => {});
  }

  return () => {
    listeners.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}));
  };
}

// Import dinamico di db.js: NativeShell è montato nel layout radice e un import statico
// trascinerebbe tutto il data layer anche nelle pagine pubbliche/SEO che non lo usano.
async function saveToken(token) {
  try {
    const { db } = await import('./db');
    await db.registerNativePushToken(token);
  } catch (err) {
    console.warn('Token push non salvato:', err?.message || err);
  }
}
