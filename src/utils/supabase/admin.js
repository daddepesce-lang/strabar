import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

const ADMIN_EMAILS = ['daddepesce@gmail.com'];

// Verifica che il chiamante sia un amministratore e restituisce un client con SERVICE ROLE.
// Ritorna { admin, user } se autorizzato, oppure { error, status } da inoltrare al client.
export async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerSupabase(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Non autenticato', status: 401 };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return { error: 'Admin non configurato sul server (manca SUPABASE_SERVICE_ROLE_KEY).', status: 500 };

  const admin = createAdminSupabase(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  const isAdmin = (me && me.is_admin) || ADMIN_EMAILS.includes((user.email || '').toLowerCase());
  if (!isAdmin) return { error: 'Accesso riservato agli amministratori', status: 403 };

  return { admin, user };
}
