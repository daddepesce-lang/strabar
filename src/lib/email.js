import { Resend } from 'resend';

// Invio email transazionali tramite Resend (lato server).
// Richiede RESEND_API_KEY nelle variabili d'ambiente e un mittente verificato.
// RESEND_FROM es: "Strabar <ciao@tuodominio.it>". In test si può usare onboarding@resend.dev
// (ma invia solo all'email del tuo account Resend).

const apiKey = process.env.RESEND_API_KEY;
// Dominio strabar.app verificato su Resend → mittente di default sul dominio.
// Override possibile con RESEND_FROM (es. "Strabar <ciao@strabar.app>").
const FROM = process.env.RESEND_FROM || 'Strabar <noreply@strabar.app>';

// Logo: nelle email serve un URL ASSOLUTO e pubblico (no percorsi locali).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app';
const LOGO_IMG = `<img src="${SITE_URL}/logo.png" alt="Strabar" width="150" style="display:block;width:150px;max-width:60%;height:auto;margin:0 0 20px" />`;

export async function sendWelcomeEmail(to, name) {
  if (!apiKey) {
    console.warn('RESEND_API_KEY non impostata: email di benvenuto saltata.');
    return { skipped: true };
  }
  const resend = new Resend(apiKey);
  const safeName = (name || 'atleta').toString();

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Benvenuto su Strabar! 🍻',
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0D0D0D;color:#F3F4F6;padding:32px;border-radius:16px;max-width:520px;margin:auto">
        ${LOGO_IMG}
        <h1 style="color:#FF2000;margin:0 0 12px">Benvenuto, ${safeName}! 🍻</h1>
        <p style="line-height:1.6;color:#9CA3AF">
          Sei ufficialmente un atleta di <strong style="color:#fff">Strabar</strong>.
          Traccia le tue sessioni, tagga gli amici, fai check-in nei locali e scala le classifiche.
        </p>
        <p style="line-height:1.6;color:#9CA3AF">Ricorda: <strong style="color:#DFFF00">bevi responsabilmente</strong> e se bevi non guidare.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app'}" style="display:inline-block;margin-top:12px;background:#FF2000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;font-weight:700">Apri Strabar</a>
        <p style="font-size:12px;color:#6b7280;margin-top:24px">18+ · Non affiliato ad altri marchi.</p>
      </div>
    `,
  });

  if (error) throw new Error(error.message || 'Invio email fallito');
  return { id: data?.id };
}

// Email di reset password brandizzata Strabar (inviata da noi via Resend, non da Supabase).
// `link` è già pronto: SITE_URL/auth/reset?token_hash=...&type=recovery
export async function sendPasswordResetEmail(to, link) {
  if (!apiKey) {
    console.warn('RESEND_API_KEY non impostata: email di reset saltata.');
    return { skipped: true };
  }
  const resend = new Resend(apiKey);

  // Data/ora della richiesta: info utile di sicurezza E rende ogni email unica,
  // così Gmail non collassa i messaggi identici dietro "..." (contenuto ritagliato).
  const when = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reimposta la tua password Strabar 🔑',
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0D0D0D;color:#F3F4F6;padding:32px;border-radius:16px;max-width:520px;margin:auto">
        ${LOGO_IMG}
        <h1 style="color:#FF2000;margin:0 0 12px">Reimposta la password 🔑</h1>
        <p style="line-height:1.6;color:#9CA3AF">
          Hai chiesto di reimpostare la password del tuo account <strong style="color:#fff">Strabar</strong>.
          Clicca il pulsante qui sotto per sceglierne una nuova.
        </p>
        <a href="${link}" style="display:inline-block;margin:16px 0;background:#FF2000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;font-weight:700">Reimposta password</a>
        <p style="line-height:1.6;color:#9CA3AF;font-size:13px">
          Il link è valido per un'ora. Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.
        </p>
        <p style="line-height:1.6;color:#6b7280;font-size:12px;margin-top:20px">Richiesta ricevuta il ${when}.</p>
        <p style="font-size:12px;color:#6b7280;margin-top:8px">18+ · Bevi responsabilmente.</p>
      </div>
    `,
  });

  if (error) throw new Error(error.message || 'Invio email di reset fallito');
  return { id: data?.id };
}

// Email al locale quando la richiesta di gestione è APPROVATA: invito a creare/attivare
// l'account del locale. `link` porta alla registrazione (o all'area gestione).
export async function sendVenueApprovalEmail(to, venueName, link) {
  if (!apiKey) {
    console.warn('RESEND_API_KEY non impostata: email approvazione locale saltata.');
    return { skipped: true };
  }
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `La tua richiesta per ${venueName} è approvata 🎉`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0D0D0D;color:#F3F4F6;padding:32px;border-radius:16px;max-width:520px;margin:auto">
        ${LOGO_IMG}
        <h1 style="color:#FF2000;margin:0 0 12px">Benvenuto su Strabar per i locali 🍻</h1>
        <p style="line-height:1.6;color:#9CA3AF">
          La richiesta di gestione per <strong style="color:#fff">${venueName}</strong> è stata <strong style="color:#fff">approvata</strong>.
          Crea (o accedi al) tuo account per gestire il locale: classifica, eventi sponsorizzati, promo e notifiche ai clienti.
        </p>
        <a href="${link}" style="display:inline-block;margin:16px 0;background:#FF2000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;font-weight:700">Attiva l'account del locale</a>
        <p style="line-height:1.6;color:#9CA3AF;font-size:13px">
          Usa questa stessa email per registrarti: collegheremo l'account al tuo locale.
        </p>
        <p style="font-size:12px;color:#6b7280;margin-top:20px">18+ · Bevi responsabilmente.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Invio email approvazione fallito');
  return { id: data?.id };
}
