import test from 'node:test';
import assert from 'node:assert/strict';
import { getPasskeyConfig } from '../src/lib/passkeyConfig';
import { passkeySigningKey, signPasskeyAssertion, verifyPasskeyAssertion } from '../src/lib/passkeyAssertion';

test('RP configuration uses exact origin and host', () => {
  assert.deepEqual(getPasskeyConfig({ PASSKEY_ORIGIN: 'https://example.com', PASSKEY_RP_ID: 'example.com' }), { origin: 'https://example.com', rpID: 'example.com' });
  assert.doesNotThrow(() => getPasskeyConfig({ PASSKEY_ORIGIN: 'http://localhost:3000', PASSKEY_RP_ID: 'localhost' }));
  for (const [origin, rp] of [['https://example.com/path','example.com'], ['https://sub.example.com','example.com'], ['http://example.com','example.com'], ['https://example.com','evil.com']]) assert.throws(() => getPasskeyConfig({ PASSKEY_ORIGIN: origin, PASSKEY_RP_ID: rp }));
});
test('passkey assertion is signed and bound to user and session', async () => {
  const key = passkeySigningKey(Buffer.alloc(32, 1).toString('base64url'));
  assert.throws(() => passkeySigningKey('short'));
  const token = await signPasskeyAssertion('user-1', 'session-1', 'credential-1', key);
  assert.equal(await verifyPasskeyAssertion(token, 'user-1', 'session-1', key), 'credential-1');
  assert.equal(await verifyPasskeyAssertion(token, 'user-2', 'session-1', key), null);
  assert.equal(await verifyPasskeyAssertion(token, 'user-1', 'session-2', key), null);
  assert.equal(await verifyPasskeyAssertion(token, 'user-1', 'session-1', Buffer.alloc(32, 2)), null);
});
