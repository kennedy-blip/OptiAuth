import test from 'node:test';
import assert from 'node:assert/strict';
import { hashRequestMetadata } from '../src/lib/biometricMetadata';
const secret = 'x'.repeat(32);
test('metadata hashes are keyed, separated and deterministic', () => {
  const a = hashRequestMetadata('192.0.2.1', 'browser', secret);
  assert.deepEqual(a, hashRequestMetadata('192.0.2.1', 'browser', secret));
  assert.notEqual(a.ipHash, hashRequestMetadata('192.0.2.1', 'browser', 'y'.repeat(32)).ipHash);
  assert.notEqual(hashRequestMetadata('192.0.2.1', '192.0.2.1', secret).ipHash, hashRequestMetadata('192.0.2.1', '192.0.2.1', secret).uaHash);
});
test('fails closed for missing secret, missing IP, spoofable header lists and bad addresses', () => {
  assert.throws(() => hashRequestMetadata('192.0.2.1', null, 'short'));
  for (const ip of [null, '', '192.0.2.1, 10.0.0.1', 'not-an-ip']) assert.throws(() => hashRequestMetadata(ip, null, secret));
  assert.doesNotThrow(() => hashRequestMetadata('2001:db8::1', null, secret));
});
