import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';

// Route handler che completa il login OAuth (Google) scambiando il `code`
// per una sessione e impostando i cookie (flusso PKCE con @supabase/ssr).
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Email di benvenuto per i NUOVI iscritti via Google: il flusso email+password la
      // manda dal client, ma l'OAuth no. Rileviamo il primo accesso (utente appena creato)
      // e inviamo la welcome. Best-effort: errori ignorati, il login non si blocca mai.
      try {
        const u = data?.user;
        const createdMs = u?.created_at ? new Date(u.created_at).getTime() : 0;
        const isNewSignup = createdMs && (Date.now() - createdMs < 2 * 60 * 1000);
        if (isNewSignup && u?.email) {
          const name = u.user_metadata?.full_name || u.user_metadata?.name || '';
          await sendWelcomeEmail(u.email, name);
        }
      } catch (e) {
        console.error('Welcome email (Google) non inviata:', e?.message || e);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Errore scambio code OAuth:', error.message);
  }

  return NextResponse.redirect(`${origin}/auth?error=oauth`);
}
