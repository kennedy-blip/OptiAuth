'use server';
import { validVector } from '@/lib/validation';
import { getSecureBiometricContext } from '@/lib/secureBiometricContext';

type Result = { success: true } | { success: false; error: string };
/** Experimental template storage, NOT passkey enrollment or proof of liveness. */
export async function enrollFaceTemplate(vector: number[], deviceLabel: string): Promise<Result> {
  if (process.env.ENABLE_EXPERIMENTAL_SESSION_FACE_CHECK !== 'true') return { success: false, error: 'Face enrollment is disabled.' };
  if (!validVector(vector) || typeof deviceLabel !== 'string' || !deviceLabel.trim() || deviceLabel.trim().length > 100) return { success: false, error: 'Invalid enrollment payload.' };
  try {
    const context = await getSecureBiometricContext();
    if (!context) return { success: false, error: 'An authenticated session is required.' };
    const { data, error } = await context.service.rpc('enroll_auxiliary_face_template', {
      p_user_id: context.userId, p_query_vector: JSON.stringify(vector), p_device_label: deviceLabel.trim(), p_ip_hash: context.ipHash, p_ua_hash: context.uaHash,
    });
    if (error || data !== 'enrolled') throw new Error('Enrollment unavailable.');
    return { success: true };
  } catch { console.error('Auxiliary face enrollment failed.'); return { success: false, error: 'Face enrollment is unavailable.' }; }
}
