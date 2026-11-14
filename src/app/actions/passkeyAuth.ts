'use server';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { passkeySigningKey, signPasskeyAssertion } from '@/lib/passkeyAssertion';
import { getPasskeySession } from '@/lib/passkeySession';
import { getPasskeyConfig } from '@/lib/passkeyConfig';
import { hasFreshPasskeyAssertion } from '@/lib/passkeyAuthorization';

const unavailable = { ok: false as const, error: 'Passkey operation unavailable or verification failed.' };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function beginPasskeyRegistration() {
  try {
    const ctx = await getPasskeySession(), config = getPasskeyConfig();
    // Registering credentials is security-sensitive. Require a recent verified
    // identity-provider authentication, not merely possession of an old session.
    if (!ctx.authTime || Date.now() / 1000 - ctx.authTime > 300 || ctx.authTime > Date.now() / 1000 + 30) throw new Error('Recent authentication required');
    const { data: credentials, error } = await ctx.db.from('user_passkeys').select('credential_id').eq('user_id', ctx.user.id);
    if (error) throw error;
    const options = await generateRegistrationOptions({ rpName: 'OptiAuth', rpID: config.rpID, userID: new TextEncoder().encode(ctx.user.id), userName: ctx.user.id, timeout: 120000, attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, excludeCredentials: credentials.map(c => ({ id: c.credential_id })) });
    const result = await ctx.db.rpc('create_passkey_challenge', { p_user_id: ctx.user.id, p_session_id: ctx.sessionId, p_purpose: 'registration', p_challenge: options.challenge });
    if (result.error || !uuid(result.data)) throw new Error('Challenge unavailable');
    return { ok: true as const, options, challengeId: result.data };
  } catch { return unavailable; }
}
export async function finishPasskeyRegistration(challengeId: string, response: RegistrationResponseJSON, label: string) {
  if (!uuid(challengeId) || !response || typeof response.id !== 'string' || response.id.length > 2048 || typeof label !== 'string' || !label.trim() || label.trim().length > 80) return unavailable;
  try {
    const ctx = await getPasskeySession(), config = getPasskeyConfig();
    if (!ctx.authTime || Date.now() / 1000 - ctx.authTime > 300 || ctx.authTime > Date.now() / 1000 + 30) throw new Error('Recent authentication required');
    const { data: challenge, error } = await ctx.db.rpc('consume_passkey_challenge', { p_id: challengeId, p_user_id: ctx.user.id, p_session_id: ctx.sessionId, p_purpose: 'registration' });
    if (error || typeof challenge !== 'string') throw new Error('Challenge unavailable');
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true });
    if (!result.verified) throw new Error('Verification failed');
    const credential = result.registrationInfo.credential;
    const saved = await ctx.db.from('user_passkeys').insert({ credential_id: credential.id, user_id: ctx.user.id, public_key: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports ?? [], label: label.trim() });
    if (saved.error) throw saved.error;
    return { ok: true as const };
  } catch { return unavailable; }
}
export async function beginPasskeyAuthentication() {
  try {
    const ctx = await getPasskeySession(), config = getPasskeyConfig();
    const { data: credentials, error } = await ctx.db.from('user_passkeys').select('credential_id,transports').eq('user_id', ctx.user.id);
    if (error || !credentials.length) throw new Error('No passkeys');
    const options = await generateAuthenticationOptions({ rpID: config.rpID, timeout: 120000, userVerification: 'required', allowCredentials: credentials.map(c => ({ id: c.credential_id, transports: c.transports })) });
    const result = await ctx.db.rpc('create_passkey_challenge', { p_user_id: ctx.user.id, p_session_id: ctx.sessionId, p_purpose: 'authentication', p_challenge: options.challenge });
    if (result.error || !uuid(result.data)) throw new Error('Challenge unavailable');
    return { ok: true as const, options, challengeId: result.data };
  } catch { return unavailable; }
}
export async function finishPasskeyAuthentication(challengeId: string, response: AuthenticationResponseJSON) {
  if (!uuid(challengeId) || !response || typeof response.id !== 'string' || response.id.length > 2048) return unavailable;
  try {
    const ctx = await getPasskeySession(), config = getPasskeyConfig(), key = passkeySigningKey(process.env.PASSKEY_ASSERTION_SECRET);
    const { data: challenge, error } = await ctx.db.rpc('consume_passkey_challenge', { p_id: challengeId, p_user_id: ctx.user.id, p_session_id: ctx.sessionId, p_purpose: 'authentication' });
    if (error || typeof challenge !== 'string') throw new Error('Challenge unavailable');
    const credentialResult = await ctx.db.from('user_passkeys').select('*').eq('user_id', ctx.user.id).eq('credential_id', response.id).maybeSingle();
    if (credentialResult.error || !credentialResult.data) throw new Error('Credential unavailable');
    const c = credentialResult.data;
    const verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true, credential: { id: c.credential_id, publicKey: new Uint8Array(Buffer.from(c.public_key, 'base64url')), counter: Number(c.counter), transports: c.transports } });
    if (!verified.verified) throw new Error('Verification failed');
    // Compare-and-swap avoids silently overwriting a newer authenticator counter.
    const update = await ctx.db.from('user_passkeys').update({ counter: verified.authenticationInfo.newCounter }).eq('user_id', ctx.user.id).eq('credential_id', c.credential_id).eq('counter', c.counter).select('credential_id');
    if (update.error || update.data.length !== 1) throw new Error('Counter update failed');
    const token = await signPasskeyAssertion(ctx.user.id, ctx.sessionId, c.credential_id, key);
    ctx.store.set('__Host-optiauth-passkey', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 300 });
    return { ok: true as const };
  } catch { return unavailable; }
}

export async function listPasskeys() {
  try {
    const ctx = await getPasskeySession();
    const { data, error } = await ctx.db.from('user_passkeys').select('credential_id,label,created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true as const, credentials: data.map(item => ({ id: item.credential_id as string, label: item.label as string, createdAt: item.created_at as string })) };
  } catch { return unavailable; }
}
/** Revocation requires a fresh, verified passkey assertion plus the identity session. */
export async function revokePasskey(credentialId: string) {
  if (typeof credentialId !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(credentialId)) return unavailable;
  try {
    if (!await hasFreshPasskeyAssertion()) throw new Error('Step-up required');
    const ctx = await getPasskeySession();
    const { data, error } = await ctx.db.from('user_passkeys').delete().eq('user_id', ctx.user.id).eq('credential_id', credentialId).select('credential_id');
    if (error || data.length !== 1) throw new Error('Credential unavailable');
    // Any protected request using the removed credential fails its DB check.
    // Clear this browser's assertion regardless of which passkey was deleted.
    ctx.store.set('__Host-optiauth-passkey', '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
    return { ok: true as const };
  } catch { return unavailable; }
}
