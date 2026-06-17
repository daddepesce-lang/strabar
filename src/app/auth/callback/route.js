import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

// Route handler che completa il login OAuth (Google) scambiando il `code`
// per una sessione e impostando i cookie (flusso PKCE con @supabase/ssr).
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Errore scambio code OAuth:', error.message);
  }

  return NextResponse.redirect(`${origin}/auth?error=oauth`);
}
