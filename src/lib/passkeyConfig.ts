/** RP/origin are static operator settings, never derived from untrusted headers. */
export function getPasskeyConfig(env: { PASSKEY_ORIGIN?: string; PASSKEY_RP_ID?: string } = { PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN, PASSKEY_RP_ID: process.env.PASSKEY_RP_ID }) {
  const origin = env.PASSKEY_ORIGIN, rpID = env.PASSKEY_RP_ID;
  if (!origin || !rpID) throw new Error('Passkey configuration missing.');
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error('Invalid passkey origin.');
  // Restrict RP ID to exact origin host, avoiding public suffix / parent-domain ambiguity.
  if (url.hostname !== rpID || rpID !== rpID.toLowerCase()) throw new Error('Passkey RP ID must match origin host.');
  return { origin, rpID };
}
