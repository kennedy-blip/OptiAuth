import test from 'node:test';
import assert from 'node:assert/strict';
import { validVector, validateEnrollment } from '../src/lib/validation';
const vector = Array.from({ length: 64 }, () => 1 / 8);
const profile = { fullName: '  Example Person ', email: ' USER@Example.com ', phone: '', organization: '', embedding: vector };
test('accepts a finite normalized 64-dimensional vector', () => { assert.equal(validVector(vector), true); });
test('rejects malformed vectors', () => {
  for (const v of [null, [], Array(64).fill(0), Array(63).fill(1 / 8), [...vector.slice(0, 63), NaN], [...vector.slice(0, 63), Infinity], Array(64).fill('0.125')]) assert.equal(validVector(v), false);
});
test('normalizes valid enrollment fields', () => { assert.deepEqual(validateEnrollment(profile), { ...profile, fullName: 'Example Person', email: 'user@example.com' }); });
test('rejects invalid untrusted enrollment input', () => {
  for (const p of [null, {}, { ...profile, fullName: '' }, { ...profile, email: 'bad' }, { ...profile, phone: 23 }, { ...profile, embedding: [] }, { ...profile, organization: 'x'.repeat(121) }]) assert.equal(validateEnrollment(p), null);
});
