import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceLiveness, createLiveness, fuseEyeVectors } from '../src/lib/liveness';
const vector = Array(64).fill(1/8) as number[];
test('centroid is unit length and preserves equivalent vectors', () => {
  const result = fuseEyeVectors([vector, vector.map(v => 2*v), vector]);
  assert.equal(result.length, 64); assert.ok(Math.abs(Math.hypot(...result) - 1) < 1e-12); assert.ok(Math.abs(result[0] - 1/8) < 1e-12);
});
test('fusion rejects invalid or inconsistent samples', () => {
  assert.throws(() => fuseEyeVectors([vector]));
  assert.throws(() => fuseEyeVectors([vector, vector, Array(64).fill(0)]));
  assert.throws(() => fuseEyeVectors([vector, vector, vector.map(v => -v)]));
  assert.throws(() => fuseEyeVectors([vector, vector, [...vector.slice(0,63), NaN]]));
});
test('blink must close then open, gaze must move then return', () => {
  let s = createLiveness(['BLINK','GAZE_LEFT'], 0);
  s = advanceLiveness(s, {ear: .3, gaze: 0, time: 1}); assert.equal(s.index, 0);
  s = advanceLiveness(s, {ear: .1, gaze: 0, time: 2}); assert.equal(s.index, 0);
  s = advanceLiveness(s, {ear: .3, gaze: 0, time: 3}); assert.equal(s.index, 1);
  s = advanceLiveness(s, {ear: .3, gaze: .2, time: 4}); assert.equal(s.index, 1);
  s = advanceLiveness(s, {ear: .3, gaze: -.2, time: 5}); assert.equal(s.index, 1);
  s = advanceLiveness(s, {ear: .3, gaze: 0, time: 6}); assert.equal(s.phase, 'complete');
});
test('challenge times out even if the next frame is valid', () => {
  let s = createLiveness(['GAZE_RIGHT'], 0);
  s = advanceLiveness(s, {ear: .3, gaze: .2, time: 100});
  s = advanceLiveness(s, {ear: .3, gaze: 0, time: 8000}); assert.equal(s.phase, 'timeout');
});
