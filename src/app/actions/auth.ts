'use server';
import { createClient } from '@supabase/supabase-js';

type Profile = { id: string; full_name: string; email: string; phone: string | null; role_or_org: string | null; created_at: string; confidence: number };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const THRESHOLD = 0.12; // Experimental only; calibrate on representative consented data.
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Add the server environment variables.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function validVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 64 && v.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(Math.hypot(...v) - 1) < 0.01;
}
async function match(vector: number[]) {
  const { data, error } = await client().rpc('match_eye_user', { query_embedding: JSON.stringify(vector), match_threshold: THRESHOLD });
  if (error) throw error;
  return (data as Profile[])[0] ?? null;
}
export async function verifyEye(vector: number[]): Promise<Result<Profile | null>> {
  if (!validVector(vector)) return { ok: false, error: 'Invalid eye signature. Please scan again.' };
  try { return { ok: true, data: await match(vector) }; }
  catch (e) { console.error('Eye matching failed:', e); return { ok: false, error: 'Could not check your eye signature. Please try again or check server configuration.' }; }
}
export async function registerProfile(input: { fullName: string; email: string; phone: string; organization: string; embedding: number[] }): Promise<Result<null>> {
  if (!input || !validVector(input.embedding)) return { ok: false, error: 'A valid eye scan is required.' };
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const organization = typeof input.organization === 'string' ? input.organization.trim() : '';
  if (!fullName || fullName.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 40 || organization.length > 120) return { ok: false, error: 'Please check your profile details and try again.' };
  try {
    if (await match(input.embedding)) return { ok: false, error: 'A similar eye signature is already registered.' };
    const { error } = await client().from('user_profiles').insert({ full_name: fullName, email, phone: phone || null, role_or_org: organization || null, eye_embedding: JSON.stringify(input.embedding) });
    if (error?.code === '23505') return { ok: false, error: 'An account with this email already exists.' };
    if (error) throw error;
    return { ok: true, data: null };
  } catch (e) { console.error('Enrollment failed:', e); return { ok: false, error: 'Could not save your profile. Please try again or check server configuration.' }; }
}
