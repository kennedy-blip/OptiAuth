import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { hashRequestMetadata } from '@/lib/biometricMetadata';

/** Server-only context. The service client must never be returned to the browser. */
export async function getSecureBiometricContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ipHeader = process.env.BIOMETRIC_TRUSTED_IP_HEADER;
  if (!url || !anon || !serviceKey || !ipHeader || !/^[a-z0-9-]+$/.test(ipHeader)) throw new Error('Server configuration missing.');
  const store = await cookies();
  const auth = createServerClient(url, anon, { cookies: {
    getAll: () => store.getAll(),
    setAll: (values: { name: string; value: string; options: CookieOptions }[]) => { for (const { name, value, options } of values) store.set(name, value, options); },
  } });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return null;
  const requestHeaders = await headers();
  const { ipHash, uaHash } = hashRequestMetadata(requestHeaders.get(ipHeader), requestHeaders.get('user-agent'), process.env.BIOMETRIC_HMAC_SECRET);
  return { userId: user.id, ipHash, uaHash, service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
