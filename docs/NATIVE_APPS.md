# Strabar su Google Play e App Store

App native Android e iOS costruite con **Capacitor 8**, senza duplicare l'app.

## Come funziona (e cosa NON cambia)

Le due app sono un **guscio nativo** che carica `https://strabar.app` in una WebView:
`server.url` in [`capacitor.config.json`](../capacitor.config.json). Conseguenze:

- Il web e la PWA restano **identici a prima**: stesso codice, stesso deploy su Vercel.
- Un deploy web aggiorna anche le app: nessun invio agli store per cambiare il prodotto
  (serve solo quando cambiano plugin, permessi, icone o versione nativa).
- Il bundle JS servito ai browser **non cresce**: il codice nativo sta in
  [`src/lib/native.js`](../src/lib/native.js) e [`src/lib/native-shell.js`](../src/lib/native-shell.js),
  caricati con import dinamico solo dentro l'app. Sul web ogni ramo nativo è un no-op
  (~una riga di guardia `window.Capacitor?.isNativePlatform?.()`).
- Nessun aumento di egress Supabase né di Fast Origin Transfer: è lo stesso traffico di oggi,
  fatto da un contenitore diverso. Il token push viene riscritto solo quando cambia.

Cosa fa la parte nativa (tutto in `src/lib/native-shell.js` + `src/lib/native.js`):

| Funzione | Sul web | Nell'app |
|---|---|---|
| Notifiche a app chiusa | Web Push VAPID + service worker | FCM (Android) / APNs (iOS) |
| Notifiche locali (soglia BAC, badge) | `showNotification` del service worker | `LocalNotifications` |
| Login Google | `signInWithOAuth` (redirect) | Sign-In nativo + `signInWithIdToken` |
| Foto sessione | `<input type="file" capture>` | picker di sistema (`Camera`) |
| Posizione | `navigator.geolocation` | `navigator.geolocation` (il bridge chiede i permessi nativi) |
| Link condivisi | normale navigazione | App Links / Universal Links → si apre l'app |
| Cache offline | service worker | cache HTTP della WebView + schermata `native/www/error.html` |
| Banner "installa la PWA" | sì | nascosto |

## Prerequisiti sulla macchina

- **Android**: Android Studio (SDK 36) e **JDK 21**. Su questa macchina c'è la 25, che con
  Gradle/AGP 8.13 può non compilare: usa il JDK incluso in Android Studio
  (`Settings → Build Tools → Gradle → Gradle JDK`) o installa Temurin 21.
- **iOS**: **Xcode completo** (ora ci sono solo i Command Line Tools) + un account Apple
  Developer (99 $/anno). Niente CocoaPods: Capacitor 8 usa Swift Package Manager.

Comandi:

```bash
npm run cap:sync     # allinea plugin e config ai progetti nativi (dopo ogni npm i di plugin)
npm run android      # apre Android Studio
npm run ios          # apre Xcode
npm run native:assets  # rigenera icone e splash da native/assets/{icon,splash}.png
```

> L'icona nativa è generata da `public/icon-512.png` scalato a 1024: per la versione definitiva
> metti un master 1024×1024 vero in `native/assets/icon.png` e rilancia `npm run native:assets`.

---

## Configurazione, in ordine

### 1. Firebase → push su Android

FCM è l'unico canale push su Android.

1. Crea un progetto Firebase e, dentro, un'app Android con package name **`app.strabar`**.
2. Scarica `google-services.json` e mettilo in `android/app/google-services.json`.
   Il build lo applica solo se esiste (vedi il blocco in fondo a `android/app/build.gradle`),
   quindi finché manca l'app compila ma non riceve push.
3. Crea un **service account** (Impostazioni progetto → Account di servizio → genera chiave
   privata JSON) e passa i tre valori alla Edge Function:

```bash
supabase secrets set \
  FCM_PROJECT_ID=<project_id> \
  FCM_CLIENT_EMAIL=<client_email> \
  FCM_PRIVATE_KEY="$(cat service-account.json | jq -r .private_key)"
```

### 2. APNs → push su iOS

1. developer.apple.com → Keys → crea una **chiave APNs** (`.p8`), scaricala (una volta sola)
   e annota il **Key ID**; il **Team ID** è nella pagina Membership.
2. Nel target Xcode: `Signing & Capabilities` → aggiungi **Push Notifications**.
   L'entitlement è già pronto in [`ios/App/App/App.entitlements`](../ios/App/App/App.entitlements).

```bash
supabase secrets set \
  APNS_KEY_ID=<key_id> APNS_TEAM_ID=<team_id> APNS_TOPIC=app.strabar \
  APNS_HOST=api.push.apple.com \
  APNS_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
```

> `APNS_HOST` deve combaciare con `aps-environment`: `api.sandbox.push.apple.com` per le build
> di sviluppo da Xcode, `api.push.apple.com` per TestFlight e App Store.

### 3. Login Google nativo

In Google Cloud Console, nello stesso progetto delle credenziali OAuth già usate dal web:

1. Client **Android**: package `app.strabar` + impronta **SHA-1** della chiave di firma
   (serve sia quella di upload sia quella di Play App Signing).
2. Client **iOS**: bundle ID `app.strabar`. Copia il **client ID invertito** in
   `ios/App/App/Info.plist` → `CFBundleURLSchemes` (ora c'è un placeholder da sostituire).
3. In **Supabase → Authentication → Providers → Google**, aggiungi il client ID Android e
   quello iOS tra i *Authorized Client IDs*: senza questo `signInWithIdToken` rifiuta il token.
4. Env var su Vercel (poi redeploy):

```
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>.apps.googleusercontent.com
```

Il web client ID serve anche su Android: è quello che il plugin usa per ottenere l'`id_token`.

### 4. Deep link (link condivisi che aprono l'app)

I due file di verifica sono generati dal sito e serviti dalla CDN:
`/.well-known/assetlinks.json` e `/.well-known/apple-app-site-association`
(route statiche in `src/app/api/well-known/`, con i rewrite in `next.config.mjs`).

Env var su Vercel:

```
ANDROID_CERT_SHA256=AA:BB:...   # impronte SHA-256, separate da virgola: chiave di upload + Play App Signing
APPLE_TEAM_ID=ABCDE12345
```

Poi in Xcode: `Signing & Capabilities` → **Associated Domains** (i domini sono già
nell'entitlements). Verifiche:

```bash
curl -s https://strabar.app/.well-known/assetlinks.json
curl -s https://strabar.app/.well-known/apple-app-site-association
```

Apple mette il proprio file in cache per qualche ora; su Android puoi forzare la verifica con
`adb shell pm verify-app-links --re-verify app.strabar`.

### 5. Database e Edge Function

```bash
supabase db push                       # migrazione 20260814120000_native_push.sql
supabase functions deploy send-push    # rami FCM + APNs accanto al Web Push
```

> **L'ordine conta.** La nuova `send-push` legge le colonne `kind` e `token`: se la deployi
> PRIMA della migrazione, la query fallisce e restano ferme anche le notifiche Web Push
> (alert guida incluso). Prima `db push`, poi `functions deploy`. Fino ad allora tutto resta
> com'è: finché non lanci questi due comandi, in produzione gira la versione attuale.

La migrazione aggiunge `kind` ('webpush' | 'fcm' | 'apns') e `token` a `push_subscriptions`.
Le righe esistenti restano `webpush` e continuano a funzionare identiche: l'alert guida
(pg_cron), la notifica live, le notifiche social e le campagne admin **non** cambiano, perché
passano tutte da `send-push`, che ora sceglie il trasporto per ogni dispositivo. Se i secret di
FCM/APNs mancano, quei dispositivi vengono saltati e il Web Push continua da solo.

---

## Checklist store

Comune a entrambi:

- **Età**: rating 17+/18+ e contenuto alcolico dichiarato. L'[AgeGate](../src/components/AgeGate.js)
  esistente serve anche qui.
- **Cancellazione account**: obbligatoria in-app; già presente (`/api/account/delete`).
- **Privacy**: informativa raggiungibile (`/privacy`) + questionario dati (Data Safety su Play,
  App Privacy su App Store): posizione, foto, email, identificatori.

Google Play:

- Account **organizzazione** (Urbana Smart) → esente dal closed testing con 12 tester per
  14 giorni richiesto agli account personali. Da verificare in Play Console.
- Policy alcol: consentita, con targeting per età.
- `targetSdkVersion` 36 già a norma; `versionCode`/`versionName` in `android/app/build.gradle`.

App Store — i tre punti veri di rischio:

1. **4.2 Minimum functionality**: un wrapper di sito web viene respinto. Le integrazioni native
   che abbiamo (push APNs, Universal Links, fotocamera, posizione, Google Sign-In nativo,
   splash, orientamento bloccato) sono ciò che rende l'app accettabile: non sono opzionali.
2. **1.4.3 / contenuti alcolici**: la stima del tasso alcolemico con badge e classifiche è la
   variabile meno prevedibile della review. Tieni visibili i disclaimer
   ([BacInfo](../src/components/BacInfo.js)) e un copy che non incoraggi il bere eccessivo.
3. **3.1.1 IAP**: siamo a posto. I due checkout Stripe (`mode: 'payment'`) vendono servizi ai
   gestori dei locali e ordini di drink, cioè beni e servizi del mondo reale → esenti da IAP.
   Se un giorno arriva un abbonamento premium **digitale** venduto in-app, su iOS servirà IAP.

## Differenze note rispetto al web

- Nessun service worker nell'app: la cache offline è quella della WebView. Se la rete manca
  al primo caricamento compare `native/www/error.html` con "Riprova".
- La notifica "live" che si aggiorna in place resta **solo Android** (filtro
  `platforms: ['android']`), come già oggi per le PWA.
- `sw.js` continua a servire il web: il bump di `BUILD` a ogni deploy resta necessario per la PWA.
- Su Android le `env(safe-area-inset-*)` non arrivano nella WebView: `globals.css` usa le
  variabili `--sa-*`, che il guscio nativo riscrive con gli inset misurati da Capacitor.
- Su Android, con `server.url` Capacitor scarica le **navigazioni HTML** con una connessione
  propria (per iniettare il bridge nella pagina remota) e non passa dalla cache della WebView:
  quelle richieste arrivano sempre all'origine. Essendo una SPA con routing client-side sono
  poche (praticamente solo l'avvio a freddo); gli asset `_next/static` seguono il percorso
  normale e restano cacheati. Impatto su Fast Origin Transfer: trascurabile.
- **Non abilitare `CapacitorHttp` né `CapacitorCookies`** in `capacitor.config.json`: quei
  plugin rimpiazzano `fetch`/`XHR` con l'implementazione nativa e romperebbero le chiamate
  di `@supabase/supabase-js` e la sessione a cookie di `@supabase/ssr`.
