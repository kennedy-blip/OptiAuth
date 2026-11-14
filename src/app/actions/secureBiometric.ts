'use server';
import { validVector } from '@/lib/validation';
import { getSecureBiometricContext } from '@/lib/secureBiometricContext';

type Result = { success: true; matched: boolean } | { success: false; error: string };
/** Experimental auxiliary signal only; never use this result to authorize access. */
export async function verifyEyeSignature(queryVector: number[]): Promise<Result> {
  if (process.env.ENABLE_EXPERIMENTAL_SESSION_EYE_CHECK !== 'true') return { success: false, error: 'Eye comparison is disabled.' };
  if (!validVector(queryVector)) return { success: false, error: 'Invalid biometric payload.' };
  try {
    const context = await getSecureBiometricContext();
    if (!context) return { success: false, error: 'An authenticated session is required.' };
    const { data, error } = await context.service.rpc('verify_auxiliary_eye_signature', {
      p_user_id: context.userId, p_query_vector: JSON.stringify(queryVector), p_ip_hash: context.ipHash, p_ua_hash: context.uaHash,
    });
    if (error || !data || !['matched', 'no_match', 'rate_limited'].includes(data.status)) throw new Error('Comparison unavailable.');
    if (data.status === 'rate_limited') return { success: false, error: 'Too many attempts. Please try again later.' };
    return { success: true, matched: data.status === 'matched' };
  } catch {
    console.error('Auxiliary eye comparison failed.');
    return { success: false, error: 'Eye comparison is unavailable.' };
  }
}
