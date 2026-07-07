import { Resend } from 'resend';

// Invio email transazionali tramite Resend (lato server).
// Richiede RESEND_API_KEY nelle variabili d'ambiente e un mittente verificato.
// RESEND_FROM es: "Strabar <ciao@tuodominio.it>". In test si può usare onboarding@resend.dev
// (ma invia solo all'email del tuo account Resend).

const apiKey = process.env.RESEND_API_KEY;
// Dominio strabar.app verificato su Resend → mittente di default sul dominio.
// Override possibile con RESEND_FROM (es. "Strabar <ciao@strabar.app>").
const FROM = process.env.RESEND_FROM || 'Strabar <noreply@strabar.app>';
// Indirizzo di risposta REALE (casella presidiata): migliora reputazione/deliverability
// rispetto a un solo noreply@. Impostalo in RESEND_REPLY_TO (es. ciao@strabar.app).
const REPLY_TO = process.env.RESEND_REPLY_TO || undefined;

// Logo: nelle email serve un URL ASSOLUTO e pubblico (no percorsi locali).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app';
const LOGO_IMG = `<img src="${SITE_URL}/logo.png" alt="Strabar" width="150" style="display:block;width:150px;max-width:60%;height:auto;margin:0 0 20px" />`;

// Solo il NOME (niente cognome): "Mario Rossi" → "Mario". Fallback neutro.
function firstName(name) {
  const first = (name || '').toString().trim().split(/\s+/)[0];
  return first || 'atleta';
}

// Invio centralizzato: aggiunge SEMPRE una versione testo (multipart) — gli HTML-only
// pesano molto sullo spam score — più header utili (anti-clipping di Gmail, reply-to,
// e List-Unsubscribe per i messaggi non strettamente transazionali).
async function send({ to, subject, html, text, unsubscribe }) {
  if (!apiKey) {
    console.warn('RESEND_API_KEY non impostata: email saltata.');
    return { skipped: true };
  }
  const resend = new Resend(apiKey);

  // ID univoco: evita che Gmail accorpi/ritagli ("...") messaggi simili.
  const headers = { 'X-Entity-Ref-ID': `strabar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  // List-Unsubscribe SOLO se è configurata una destinazione che riceve davvero
  // (RESEND_UNSUBSCRIBE = email presidiata o URL https). Il dominio ha "receiving"
  // disabilitato, quindi un mailto @strabar.app rimbalzerebbe: meglio non metterlo.
  const unsubTarget = process.env.RESEND_UNSUBSCRIBE;
  if (unsubscribe && unsubTarget) {
    headers['List-Unsubscribe'] = unsubTarget.startsWith('http')
      ? `<${unsubTarget}>`
      : `<mailto:${unsubTarget}?subject=unsubscribe>`;
  }

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    headers,
  });

  if (error) throw new Error(error.message || 'Invio email fallito');
  return { id: data?.id };
}

// ─────────────────────────── LOCALIZZAZIONE EMAIL ───────────────────────────
// Le email transazionali vengono inviate nella lingua dell'utente (profiles.lang o
// il locale passato dal client). Chiavi con {name}/{venue}/{when} interpolate.
const EMAIL_LANGS = ['it', 'en', 'fr', 'es'];
const emailLang = (l) => (EMAIL_LANGS.includes(l) ? l : 'it');
const DATE_LOCALE = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

const shell = (inner) => `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0A0A0D;color:#F3F4F6;padding:32px;border-radius:16px;max-width:520px;margin:auto">
        ${LOGO_IMG}
        ${inner}
      </div>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;margin:16px 0;background:#FF3B2F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;font-weight:700">${label}</a>`;

const WELCOME = {
  it: { subject: 'Benvenuto/a su Strabar! 🍻', h: 'Benvenuto/a, {name}! 🍻', p1: 'Sei ufficialmente un atleta di <strong style="color:#fff">Strabar</strong>. Traccia le tue sessioni, tagga gli amici, fai check-in nei locali e scala le classifiche.', p2: 'Ricorda: <strong style="color:#DFFF00">bevi responsabilmente</strong> e se bevi non guidare.', cta: 'Apri Strabar', foot: '18+ · Non affiliato ad altri marchi.' },
  en: { subject: 'Welcome to Strabar! 🍻', h: 'Welcome, {name}! 🍻', p1: 'You are officially a <strong style="color:#fff">Strabar</strong> athlete. Track your sessions, tag friends, check in at venues and climb the leaderboards.', p2: 'Remember: <strong style="color:#DFFF00">drink responsibly</strong> and never drink and drive.', cta: 'Open Strabar', foot: '18+ · Not affiliated with any other brand.' },
  fr: { subject: 'Bienvenue sur Strabar ! 🍻', h: 'Bienvenue, {name} ! 🍻', p1: 'Tu es officiellement un athlète <strong style="color:#fff">Strabar</strong>. Enregistre tes sessions, tague tes amis, fais des check-ins dans les bars et grimpe dans les classements.', p2: 'Rappelle-toi : <strong style="color:#DFFF00">bois avec modération</strong> et ne conduis jamais après avoir bu.', cta: 'Ouvrir Strabar', foot: '18+ · Non affilié à une autre marque.' },
  es: { subject: '¡Bienvenido/a a Strabar! 🍻', h: '¡Bienvenido/a, {name}! 🍻', p1: 'Ya eres oficialmente un atleta de <strong style="color:#fff">Strabar</strong>. Registra tus sesiones, etiqueta a tus amigos, haz check-in en los locales y sube en las clasificaciones.', p2: 'Recuerda: <strong style="color:#DFFF00">bebe con responsabilidad</strong> y si bebes no conduzcas.', cta: 'Abrir Strabar', foot: '18+ · No afiliado a ninguna otra marca.' },
};

export async function sendWelcomeEmail(to, name, lang) {
  const L = WELCOME[emailLang(lang)];
  const safeName = firstName(name);
  const html = shell(`
        <h1 style="color:#FF3B2F;margin:0 0 12px">${fill(L.h, { name: safeName })}</h1>
        <p style="line-height:1.6;color:#9CA3AF">${L.p1}</p>
        <p style="line-height:1.6;color:#9CA3AF">${L.p2}</p>
        ${btn(SITE_URL, L.cta)}
        <p style="font-size:12px;color:#6b7280;margin-top:24px">${L.foot}</p>`);
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const text = [fill(L.h, { name: safeName }), '', strip(L.p1), '', strip(L.p2), '', `${L.cta}: ${SITE_URL}`, '', L.foot].join('\n');
  return send({ to, subject: L.subject, html, text, unsubscribe: true });
}

const RESET = {
  it: { subject: 'Reimposta la tua password Strabar 🔑', h: 'Reimposta la password 🔑', p1: 'Hai chiesto di reimpostare la password del tuo account <strong style="color:#fff">Strabar</strong>. Clicca il pulsante qui sotto per sceglierne una nuova.', cta: 'Reimposta password', p2: "Il link è valido per un'ora. Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.", when: 'Richiesta ricevuta il {when}.', foot: '18+ · Bevi responsabilmente.' },
  en: { subject: 'Reset your Strabar password 🔑', h: 'Reset your password 🔑', p1: 'You asked to reset the password of your <strong style="color:#fff">Strabar</strong> account. Click the button below to choose a new one.', cta: 'Reset password', p2: 'The link is valid for one hour. If you did not request this, ignore this email: your password stays the same.', when: 'Request received on {when}.', foot: '18+ · Drink responsibly.' },
  fr: { subject: 'Réinitialise ton mot de passe Strabar 🔑', h: 'Réinitialise ton mot de passe 🔑', p1: 'Tu as demandé à réinitialiser le mot de passe de ton compte <strong style="color:#fff">Strabar</strong>. Clique sur le bouton ci-dessous pour en choisir un nouveau.', cta: 'Réinitialiser le mot de passe', p2: "Le lien est valable une heure. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : ton mot de passe reste inchangé.", when: 'Demande reçue le {when}.', foot: '18+ · Bois avec modération.' },
  es: { subject: 'Restablece tu contraseña de Strabar 🔑', h: 'Restablece la contraseña 🔑', p1: 'Has pedido restablecer la contraseña de tu cuenta de <strong style="color:#fff">Strabar</strong>. Pulsa el botón de abajo para elegir una nueva.', cta: 'Restablecer contraseña', p2: 'El enlace es válido durante una hora. Si no has solicitado el cambio, ignora este correo: tu contraseña no cambiará.', when: 'Solicitud recibida el {when}.', foot: '18+ · Bebe con responsabilidad.' },
};

export async function sendPasswordResetEmail(to, link, lang) {
  const lg = emailLang(lang);
  const L = RESET[lg];
  const when = new Date().toLocaleString(DATE_LOCALE[lg], { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });
  const html = shell(`
        <h1 style="color:#FF3B2F;margin:0 0 12px">${L.h}</h1>
        <p style="line-height:1.6;color:#9CA3AF">${L.p1}</p>
        ${btn(link, L.cta)}
        <p style="line-height:1.6;color:#9CA3AF;font-size:13px">${L.p2}</p>
        <p style="line-height:1.6;color:#6b7280;font-size:12px;margin-top:20px">${fill(L.when, { when })}</p>
        <p style="font-size:12px;color:#6b7280;margin-top:8px">${L.foot}</p>`);
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const text = [L.h, '', strip(L.p1), link, '', strip(L.p2), '', fill(L.when, { when })].join('\n');
  return send({ to, subject: L.subject, html, text });
}

const VENUE = {
  it: { subject: 'La tua richiesta per {venue} è approvata 🎉', h: 'Benvenuto su Strabar per i locali 🍻', p1: 'La richiesta di gestione per <strong style="color:#fff">{venue}</strong> è stata <strong style="color:#fff">approvata</strong>. Crea (o accedi al) tuo account per gestire il locale: classifica, eventi sponsorizzati, promo e notifiche ai clienti.', cta: "Attiva l'account del locale", p2: "Usa questa stessa email per registrarti: collegheremo l'account al tuo locale.", foot: '18+ · Bevi responsabilmente.' },
  en: { subject: 'Your request for {venue} is approved 🎉', h: 'Welcome to Strabar for venues 🍻', p1: 'The management request for <strong style="color:#fff">{venue}</strong> has been <strong style="color:#fff">approved</strong>. Create (or sign in to) your account to manage the venue: leaderboard, sponsored events, promos and customer notifications.', cta: 'Activate the venue account', p2: 'Use this same email to sign up: we will link the account to your venue.', foot: '18+ · Drink responsibly.' },
  fr: { subject: 'Ta demande pour {venue} est approuvée 🎉', h: 'Bienvenue sur Strabar pour les bars 🍻', p1: 'La demande de gestion pour <strong style="color:#fff">{venue}</strong> a été <strong style="color:#fff">approuvée</strong>. Crée (ou connecte-toi à) ton compte pour gérer le bar : classement, événements sponsorisés, promos et notifications aux clients.', cta: 'Activer le compte du bar', p2: 'Utilise ce même e-mail pour t\'inscrire : nous lierons le compte à ton bar.', foot: '18+ · Bois avec modération.' },
  es: { subject: 'Tu solicitud para {venue} está aprobada 🎉', h: 'Bienvenido a Strabar para locales 🍻', p1: 'La solicitud de gestión de <strong style="color:#fff">{venue}</strong> ha sido <strong style="color:#fff">aprobada</strong>. Crea (o inicia sesión en) tu cuenta para gestionar el local: clasificación, eventos patrocinados, promos y notificaciones a los clientes.', cta: 'Activar la cuenta del local', p2: 'Usa este mismo correo para registrarte: vincularemos la cuenta a tu local.', foot: '18+ · Bebe con responsabilidad.' },
};

// `link` porta alla registrazione (o all'area gestione). `lang` = lingua del destinatario.
export async function sendVenueApprovalEmail(to, venueName, link, lang) {
  const L = VENUE[emailLang(lang)];
  const html = shell(`
        <h1 style="color:#FF3B2F;margin:0 0 12px">${L.h}</h1>
        <p style="line-height:1.6;color:#9CA3AF">${fill(L.p1, { venue: venueName })}</p>
        ${btn(link, L.cta)}
        <p style="line-height:1.6;color:#9CA3AF;font-size:13px">${L.p2}</p>
        <p style="font-size:12px;color:#6b7280;margin-top:20px">${L.foot}</p>`);
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const text = [fill(L.subject, { venue: venueName }), '', strip(fill(L.p1, { venue: venueName })), '', `${L.cta}: ${link}`, '', L.p2].join('\n');
  return send({ to, subject: fill(L.subject, { venue: venueName }), html, text });
}
