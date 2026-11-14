import { SignJWT, jwtVerify } from 'jose';
export function passkeySigningKey(raw: string | undefined): Uint8Array {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid passkey signing key');
  const key = Buffer.from(raw, 'base64url');
  if (key.length < 32) throw new Error('Invalid passkey signing key');
  return key;
}
export async function signPasskeyAssertion(userId: string, sessionId: string, credentialId: string, key: Uint8Array) {
  return new SignJWT({ sid: sessionId, cid: credentialId, amr: ['webauthn'] }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(userId).setIssuer('optiauth-passkey').setAudience('optiauth-step-up').setIssuedAt().setExpirationTime('5m').sign(key);
}
/** Signature validation alone is not authorization; also check credential existence. */
export async function verifyPasskeyAssertion(token: string, userId: string, sessionId: string, key: Uint8Array): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: 'optiauth-passkey', audience: 'optiauth-step-up', requiredClaims: ['sub', 'sid', 'cid', 'iat', 'exp'], maxTokenAge: '5m' });
    if (payload.sub !== userId || payload.sid !== sessionId || typeof payload.cid !== 'string' || !payload.cid || payload.cid.length > 2048 || !Array.isArray(payload.amr) || payload.amr.length !== 1 || payload.amr[0] !== 'webauthn') return null;
    return payload.cid;
  } catch { return null; }
}
