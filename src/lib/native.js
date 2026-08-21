// Ponte verso il guscio nativo (Capacitor, Android + iOS).
//
// REGOLA FONDAMENTALE: qui NON si importa nessun pacchetto `@capacitor/*`.
// L'app nativa carica la stessa app servita da https://strabar.app (vedi `server.url` in
// capacitor.config.json) e Capacitor inietta il proprio bridge nella pagina remota: i plugin
// sono quindi già disponibili su `window.Capacitor.Plugins`. Passando dal globale:
//   1) il bundle JS servito ai browser non cresce di un byte (zero impatto su egress/transfer);
//   2) il codice web resta identico a oggi — su browser ogni funzione qui sotto è un no-op.
// Il prezzo è non avere i tipi TS dei plugin: i nomi dei metodi sono quelli documentati dai
// plugin dichiarati in `package.json`, che restano la fonte di verità delle firme.

/** L'oggetto Capacitor, ma SOLO se siamo davvero dentro l'app nativa (non su web). */
function cap() {
  if (typeof window === 'undefined') return null;
  const c = window.Capacitor;
  if (!c || typeof c.isNativePlatform !== 'function') return null;
  return c.isNativePlatform() ? c : null;
}

/** true dentro l'app Android/iOS, false su browser e PWA. */
export function isNative() {
  return !!cap();
}

/** 'android' | 'ios' | null (null = browser). */
export function nativePlatform() {
  const c = cap();
  return c ? c.getPlatform() : null;
}

/** Un plugin nativo per nome, o null se non siamo nell'app / il plugin non è installato. */
export function nativePlugin(name) {
  const c = cap();
  if (!c) return null;
  return (c.Plugins && c.Plugins[name]) || null;
}

// ---------------------------------------------------------------------------
// Notifiche push
// ---------------------------------------------------------------------------

// Nella WebView non esiste la Push API (né su Android WebView né su WKWebView): al posto
// di Web Push + service worker si usa il canale nativo, FCM su Android e APNs su iOS.
// Il token che ne esce viene salvato in `push_subscriptions` da `db.registerPushSubscription`.

/** Stato del permesso notifiche nell'app nativa: 'granted' | 'denied' | 'prompt'. */
export async function nativePushPermission() {
  const push = nativePlugin('PushNotifications');
  if (!push) return null;
  try {
    const { receive } = await push.checkPermissions();
    return receive;
  } catch {
    return null;
  }
}

/** Chiede il permesso notifiche (Android 13+ e iOS mostrano il dialog di sistema). */
export async function nativeRequestPushPermission() {
  const push = nativePlugin('PushNotifications');
  if (!push) return null;
  try {
    const { receive } = await push.requestPermissions();
    return receive;
  } catch {
    return 'denied';
  }
}

/**
 * Registra il dispositivo su FCM/APNs e restituisce il token, o null se il permesso manca
 * o la registrazione fallisce. `register()` non ritorna il token: arriva sull'evento
 * `registration`, quindi ci mettiamo in ascolto PRIMA di chiamarla e aspettiamo l'evento.
 */
export async function nativePushToken({ timeoutMs = 15000 } = {}) {
  const push = nativePlugin('PushNotifications');
  if (!push) return null;

  let perm = await nativePushPermission();
  if (perm === 'prompt' || perm === 'prompt-with-rationale') perm = await nativeRequestPushPermission();
  if (perm !== 'granted') return null;

  return new Promise((resolve) => {
    let done = false;
    const handles = [];
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // `addListener` è asincrono: le handle possono arrivare dopo il finish → le rimuoviamo
      // comunque appena disponibili, così non restano listener orfani a ogni chiamata.
      handles.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}));
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    handles.push(push.addListener('registration', (t) => finish(t?.value || null)));
    handles.push(push.addListener('registrationError', () => finish(null)));

    push.register().catch(() => finish(null));
  });
}

/**
 * Notifica LOCALE, generata sul dispositivo ad app aperta (soglia BAC raggiunta, badge
 * sbloccato). Sul web questo lo fa il service worker; qui lo fa il sistema operativo.
 */
export async function nativeLocalNotify(title, body) {
  const local = nativePlugin('LocalNotifications');
  if (!local) return false;
  try {
    const { display } = await local.checkPermissions();
    if (display !== 'granted') {
      const asked = await local.requestPermissions();
      if (asked?.display !== 'granted') return false;
    }
    await local.schedule({
      notifications: [
        {
          // L'id deve essere un intero: usiamo il tempo corrente troncato, così due notifiche
          // ravvicinate non si sovrascrivono a vicenda.
          id: Date.now() % 2147483647,
          title,
          body,
          smallIcon: 'ic_stat_icon',
          iconColor: '#FF3B2F',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('Notifica locale non mostrata:', err?.message || err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Login Google nativo
// ---------------------------------------------------------------------------

// Google BLOCCA il suo OAuth dentro le WebView embedded (errore `disallowed_useragent`):
// il flusso web `signInWithOAuth` non è utilizzabile nell'app. Si usa quindi il Sign-In
// nativo (Credential Manager su Android, GoogleSignIn su iOS) e si scambia l'id_token con
// Supabase via `signInWithIdToken` — la sessione che ne risulta è identica a quella web.

let socialInitPromise = null;

function googleClientIds() {
  return {
    webClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
    iOSClientId: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  };
}

/** Inizializza il plugin una volta sola per sessione della WebView. */
function initSocialLogin() {
  const social = nativePlugin('SocialLogin');
  if (!social) return null;
  if (!socialInitPromise) {
    const { webClientId, iOSClientId } = googleClientIds();
    socialInitPromise = social
      .initialize({
        google: {
          // Android usa SEMPRE il web client ID (il client Android serve solo alla firma);
          // iOS usa il proprio client ID e `iOSServerClientId` = web client ID, che è ciò
          // che fa combaciare l'`aud` dell'id_token con quello configurato su Supabase.
          webClientId,
          ...(iOSClientId ? { iOSClientId, iOSServerClientId: webClientId } : {}),
          mode: 'online',
        },
      })
      .catch((err) => {
        socialInitPromise = null;
        throw err;
      });
  }
  return socialInitPromise;
}

/**
 * Apre il selettore account nativo e restituisce l'id_token di Google da passare a
 * Supabase. Lancia se il plugin manca, i client ID non sono configurati o l'utente annulla.
 */
export async function nativeGoogleIdToken() {
  const social = nativePlugin('SocialLogin');
  if (!social) throw new Error('Login Google nativo non disponibile su questa piattaforma');
  const { webClientId } = googleClientIds();
  if (!webClientId) throw new Error('Manca NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID');

  await initSocialLogin();
  const res = await social.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('Google non ha restituito un id_token');
  return idToken;
}

/** Sgancia l'account Google dal dispositivo, così il prossimo login richiede la scelta. */
export async function nativeGoogleSignOut() {
  const social = nativePlugin('SocialLogin');
  if (!social) return;
  try {
    await social.logout({ provider: 'google' });
  } catch {
    /* già disconnesso o mai inizializzato: non è un errore per l'utente */
  }
}

// ---------------------------------------------------------------------------
// Fotocamera
// ---------------------------------------------------------------------------

/**
 * Scatta o scegli una foto col picker nativo e restituisce un `File`, così i flussi di
 * upload esistenti (che partono da un `<input type="file">`) funzionano senza modifiche.
 * Restituisce null se l'utente annulla.
 */
export async function nativeTakePhoto({ source = 'PROMPT' } = {}) {
  const camera = nativePlugin('Camera');
  if (!camera) return null;
  try {
    const photo = await camera.getPhoto({
      source, // 'PROMPT' = l'utente sceglie tra fotocamera e galleria
      resultType: 'base64',
      // Ridimensioniamo e comprimiamo già sul dispositivo: meno byte in upload verso R2
      // e nessun scatto da 12 MP spedito tal quale.
      quality: 82,
      width: 1600,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
      promptLabelHeader: 'Foto',
      promptLabelPhoto: 'Scegli dalla galleria',
      promptLabelPicture: 'Scatta una foto',
      promptLabelCancel: 'Annulla',
    });
    if (!photo?.base64String) return null;
    const type = photo.format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = photo.format === 'png' ? 'png' : 'jpg';
    const bin = atob(photo.base64String);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], `strabar-${Date.now()}.${ext}`, { type });
  } catch (err) {
    // L'annullamento dell'utente arriva come eccezione: non è un errore da mostrare.
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes('cancel')) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Varie
// ---------------------------------------------------------------------------

/** Apre un URL fuori dall'app (browser di sistema), per i link esterni. */
export async function nativeOpenExternal(url) {
  const browser = nativePlugin('Browser');
  if (!browser) return false;
  try {
    await browser.open({ url, presentationStyle: 'popover' });
    return true;
  } catch {
    return false;
  }
}

/** Condivisione col foglio di sistema (più naturale del Web Share dentro la WebView). */
export async function nativeShare({ title, text, url }) {
  const share = nativePlugin('Share');
  if (!share) return false;
  try {
    await share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}

/** Vibrazione breve di conferma (no-op dove Haptics non c'è). */
export async function nativeHaptic(style = 'MEDIUM') {
  const haptics = nativePlugin('Haptics');
  if (!haptics) return;
  try {
    await haptics.impact({ style });
  } catch {
    /* niente feedback tattile: irrilevante */
  }
}
