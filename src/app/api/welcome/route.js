import { NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email';

// POST /api/welcome  { email, name }
// Invia l'email di benvenuto via Resend (best-effort).
export async function POST(request) {
  try {
    const { email, name } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email mancante' }, { status: 400 });
    }
    const result = await sendWelcomeEmail(email, name);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Errore invio email di benvenuto:', err);
    return NextResponse.json({ error: err.message || 'Errore' }, { status: 500 });
  }
}
