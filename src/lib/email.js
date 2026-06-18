import { Resend } from 'resend';

// Invio email transazionali tramite Resend (lato server).
// Richiede RESEND_API_KEY nelle variabili d'ambiente e un mittente verificato.
// RESEND_FROM es: "Strabar <ciao@tuodominio.it>". In test si può usare onboarding@resend.dev
// (ma invia solo all'email del tuo account Resend).

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Strabar <onboarding@resend.dev>';

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
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B0C10;color:#F3F4F6;padding:32px;border-radius:16px;max-width:520px;margin:auto">
        <h1 style="color:#FF5E00;margin:0 0 12px">Benvenuto, ${safeName}! 🍻</h1>
        <p style="line-height:1.6;color:#9CA3AF">
          Sei ufficialmente un atleta di <strong style="color:#fff">Strabar</strong>.
          Traccia le tue sessioni, tagga gli amici, fai check-in nei locali e scala le classifiche.
        </p>
        <p style="line-height:1.6;color:#9CA3AF">Ricorda: <strong style="color:#FFB000">bevi responsabilmente</strong> e se bevi non guidare.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app'}" style="display:inline-block;margin-top:12px;background:#FF5E00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:30px;font-weight:700">Apri Strabar</a>
        <p style="font-size:12px;color:#6b7280;margin-top:24px">18+ · Non affiliato ad altri marchi.</p>
      </div>
    `,
  });

  if (error) throw new Error(error.message || 'Invio email fallito');
  return { id: data?.id };
}
