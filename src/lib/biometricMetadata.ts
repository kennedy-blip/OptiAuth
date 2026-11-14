import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
/** Only use a header your ingress always overwrites with a single client IP. */
export function hashRequestMetadata(ip: string | null, userAgent: string | null, secret: string | undefined) {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Metadata HMAC secret must contain at least 32 bytes.');
  const clientIp = ip?.trim();
  if (!clientIp || !isIP(clientIp)) throw new Error('Trusted client IP unavailable.');
  const digest = (kind: string, value: string) => createHmac('sha256', secret).update(`${kind}\0${value}`).digest('hex');
  return { ipHash: digest('ip', clientIp), uaHash: digest('ua', (userAgent || 'unknown').slice(0, 512)) };
}
