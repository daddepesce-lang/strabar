import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { r2Put, isR2Configured } from '@/lib/r2';

export const runtime = 'nodejs';

const MAX_BYTES = 12 * 1024 * 1024; // limite di sicurezza per file (post-compressione lato client)

function randName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}

// POST /api/upload — carica su Cloudflare R2 i file multimediali dell'utente autenticato.
// Riceve FormData: `full` (immagine compressa, obbligatoria) e `thumb` (miniatura, opzionale).
// Le chiavi R2 restano sul server. Ritorna { url, thumb } (URL pubbliche immutabili su R2).
export async function POST(req) {
  if (!isR2Configured) {
    return NextResponse.json({ error: 'Storage non configurato (R2_* mancanti).' }, { status: 500 });
  }

  // Solo utenti autenticati possono caricare (e i file finiscono sotto la loro cartella).
  const cookieStore = await cookies();
  const supabase = createServerSupabase(cookieStore);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 });
  }

  const full = form.get('full');
  const thumb = form.get('thumb');
  if (!full || typeof full === 'string') {
    return NextResponse.json({ error: 'File mancante' }, { status: 400 });
  }
  if (!full.type?.startsWith('image/') || full.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File non valido o troppo grande' }, { status: 400 });
  }

  const ext = (full.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const base = `media/${user.id}/${randName(ext)}`;

  try {
    const fullBuf = Buffer.from(await full.arrayBuffer());
    const url = await r2Put(base, fullBuf, full.type);

    let thumbUrl = null;
    if (thumb && typeof thumb !== 'string' && thumb.type?.startsWith('image/') && thumb.size <= MAX_BYTES) {
      const thumbKey = base.replace(/\.(\w+)$/, '_thumb.$1');
      const thumbBuf = Buffer.from(await thumb.arrayBuffer());
      thumbUrl = await r2Put(thumbKey, thumbBuf, thumb.type);
    }

    return NextResponse.json({ url, thumb: thumbUrl || url });
  } catch (err) {
    console.error('Upload R2 fallito:', err);
    return NextResponse.json({ error: 'Caricamento non riuscito' }, { status: 500 });
  }
}
