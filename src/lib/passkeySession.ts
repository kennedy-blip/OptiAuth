import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
export async function getPasskeySession() {
  if (process.env.ENABLE_EXPERIMENTAL_PASSKEYS !== 'true') throw new Error('Passkeys disabled.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, role = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !role) throw new Error('Passkey configuration missing.');
  const store = await cookies();
  const auth = createServerClient(url, key, { cookies: {
    getAll: () => store.getAll(),
    setAll: (values: { name: string; value: string; options: CookieOptions }[]) => { for (const { name, value, options } of values) store.set(name, value, options); },
  } });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new Error('Session required.');
  const claims = await auth.auth.getClaims();
  const sessionId = claims.data?.claims?.session_id;
  if (claims.error || claims.data?.claims?.sub !== user.id || typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error('Valid session required.');
  const authTime = claims.data?.claims?.auth_time;
  return { user, sessionId, authTime: typeof authTime === 'number' ? authTime : undefined, store, db: createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
