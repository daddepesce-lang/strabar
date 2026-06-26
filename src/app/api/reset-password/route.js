import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { sendPasswordResetEmail } from '@/lib/email';

// POST /api/reset-password  { email }
// Genera il link di recupero con la service-role key e invia un'email di reset
// brandizzata Strabar via Resend — così non dipendiamo dal mailer/template di Supabase
// (che richiede la configurazione SMTP per essere personalizzato).
// Il link usa token_hash → la pagina /auth/reset lo verifica con verifyOtp,
// quindi funziona anche cross-dispositivo / cross-dominio.
export async function POST(request) {
  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }
  email = (email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://strabar.app';
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server non configurato' }, { status: 500 });
  }

  const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/auth/reset` },
    });
    // Non riveliamo se l'email esiste o meno (anti-enumerazione): rispondiamo sempre ok.
    if (error) {
      console.warn('generateLink reset fallito:', error.message);
      return NextResponse.json({ ok: true });
    }
    const tokenHash = data?.properties?.hashed_token;
    if (tokenHash) {
      const link = `${siteUrl}/auth/reset?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
      await sendPasswordResetEmail(email, link);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Errore invio reset password:', err);
    // Anche in caso di errore non sveliamo dettagli al client.
    return NextResponse.json({ ok: true });
  }
}
