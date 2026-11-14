import { getPasskeySession } from '@/lib/passkeySession';
import { passkeySigningKey, verifyPasskeyAssertion } from '@/lib/passkeyAssertion';
/** Revalidate identity, session, assertion AND credential on every protected request. */
export async function hasFreshPasskeyAssertion(): Promise<boolean> {
  try {
    const ctx = await getPasskeySession();
    const token = ctx.store.get('__Host-optiauth-passkey')?.value;
    if (!token) return false;
    const credentialId = await verifyPasskeyAssertion(token, ctx.user.id, ctx.sessionId, passkeySigningKey(process.env.PASSKEY_ASSERTION_SECRET));
    if (!credentialId) return false;
    const result = await ctx.db.from('user_passkeys').select('credential_id').eq('user_id', ctx.user.id).eq('credential_id', credentialId).maybeSingle();
    return !result.error && !!result.data;
  } catch { return false; }
}
