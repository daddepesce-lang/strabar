import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';

// Lingua della welcome per i signup Google: il flusso email+password la passa dal client
// (locale dell'app), ma nell'OAuth non abbiamo quel dato → la deduciamo dall'header
// Accept-Language del browser. Fallback: it (come emailLang lato server).
function langFromAcceptLanguage(header) {
  const first = (header || '').split(',')[0]?.trim().toLowerCase() || '';
  if (first.startsWith('en')) return 'en';
  if (first.startsWith('fr')) return 'fr';
  if (first.startsWith('es')) return 'es';
  return 'it';
}

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
          const lang = langFromAcceptLanguage(request.headers.get('accept-language'));
          await sendWelcomeEmail(u.email, name, lang);
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
