'use server';
import { createClient } from '@supabase/supabase-js';
import { validVector, validateEnrollment, type Enrollment } from '@/lib/validation';

type Match = { confidence: number };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
// Publicly callable Server Actions cannot attest that a vector came from a live
// camera. Keep this experiment off unless an operator explicitly enables it.
function enabled() { return process.env.ENABLE_UNSAFE_FACE_DEMO === 'true'; }
const disabledMessage = 'Biometric demo is disabled. An administrator must explicitly enable it.';
export async function verifyFace(vector: number[]): Promise<Result<Match | null>> {
  if (!enabled()) return { ok: false, error: disabledMessage };
  if (!validVector(vector)) return { ok: false, error: 'Invalid face signature. Please scan again.' };
  try {
    const { data, error } = await client().rpc('match_face_user', { query_embedding: JSON.stringify(vector) });
    if (error) throw error;
    const row = (data as { confidence: number }[])[0];
    // A match is not proof of identity. Never return another person's PII.
    return { ok: true, data: row ? { confidence: row.confidence } : null };
  } catch (e) { console.error('Face matching failed:', e); return { ok: false, error: 'Could not check your face signature. Please try again or check server configuration.' }; }
}
export async function registerProfile(input: Enrollment): Promise<Result<null>> {
  if (!enabled()) return { ok: false, error: disabledMessage };
  const profile = validateEnrollment(input);
  if (!profile) return { ok: false, error: 'Please check your profile details and face scan and try again.' };
  try {
    const { data, error } = await client().rpc('enroll_face_user', {
      profile_full_name: profile.fullName, profile_email: profile.email,
      profile_phone: profile.phone || null, profile_role_or_org: profile.organization || null,
      query_embedding: JSON.stringify(profile.embedding),
    });
    if (error) throw error;
    // Do not reveal whether the email or face template belongs to another user.
    if (data === 'duplicate_face' || data === 'duplicate_email') return { ok: false, error: 'Unable to enroll this profile. Please contact an administrator.' };
    if (data !== 'created') throw new Error('Unexpected enrollment result');
    return { ok: true, data: null };
  } catch (e) { console.error('Enrollment failed:', e); return { ok: false, error: 'Could not save your profile. Please try again or check server configuration.' }; }
}
