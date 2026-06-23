import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { r2DeletePrefix, isR2Configured } from '@/lib/r2';

export const runtime = 'nodejs';

// POST /api/account/delete
// Cancellazione account self-service (GDPR — diritto all'oblio, art. 17).
// 1) verifica l'identità leggendo l'utente autenticato dai cookie di sessione;
// 2) elimina l'utente da auth.users con la SERVICE ROLE. La cancellazione fa
//    cascata (ON DELETE CASCADE) su profilo, sessioni, percorsi, follow, commenti,
//    cheers, recensioni, eventi e notifiche collegate.
//
// Richiede la variabile d'ambiente SUPABASE_SERVICE_ROLE_KEY (NON usare il prefisso
// NEXT_PUBLIC_: è una chiave segreta che deve restare solo lato server).
export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabase(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !url) {
      return NextResponse.json(
        { error: 'Cancellazione non configurata sul server (manca SUPABASE_SERVICE_ROLE_KEY).' },
        { status: 500 }
      );
    }

    const admin = createAdminSupabase(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Diritto all'oblio anche per i file multimediali: elimina da R2 tutti gli oggetti
    // dell'utente (sono salvati sotto media/<userId>/). Best-effort: non blocca la
    // cancellazione dell'account se R2 non risponde.
    if (isR2Configured) {
      try { await r2DeletePrefix(`media/${user.id}/`); }
      catch (e) { console.error('Pulizia R2 fallita (account delete):', e); }
    }

    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) {
      console.error('Errore cancellazione utente:', delError);
      return NextResponse.json({ error: delError.message || 'Cancellazione non riuscita' }, { status: 500 });
    }

    // Termina la sessione lato server (best-effort).
    await supabase.auth.signOut().catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Errore /api/account/delete:', err);
    return NextResponse.json({ error: err.message || 'Errore' }, { status: 500 });
  }
}
