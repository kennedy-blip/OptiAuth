import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFaceVector } from '../src/lib/faceBiometrics';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

function points(): NormalizedLandmark[] {
  const result = Array.from({ length: 478 }, (_, i) => ({ x: .3 + (i % 19) * .01, y: .2 + (i % 31) * .01, z: 0, visibility: 1 }));
  result[33] = { x: .25, y: .35, z: 0, visibility: 1 }; result[263] = { x: .65, y: .35, z: 0, visibility: 1 };
  return result;
}
test('face descriptor is finite, 64-dimensional and normalized', () => {
  const vector = extractFaceVector(points(), 640, 480);
  assert.equal(vector.length, 64); assert.ok(vector.every(Number.isFinite)); assert.ok(Math.abs(Math.hypot(...vector)-1) < 1e-10);
});
test('descriptor is invariant to translation, scale and in-plane rotation in pixel coordinates', () => {
  const original = points(), theta = .4, scale = 1.7;
  const transformed = original.map(p => { const x=p.x*640, y=p.y*480; return { x:(scale*(x*Math.cos(theta)-y*Math.sin(theta))+42)/640, y:(scale*(x*Math.sin(theta)+y*Math.cos(theta))+77)/480, z:0, visibility:1 }; });
  const a=extractFaceVector(original,640,480), b=extractFaceVector(transformed,640,480);
  assert.ok(a.every((v,i) => Math.abs(v-b[i]) < 1e-10));
});
test('rejects incomplete, invalid and degenerate landmarks', () => {
  assert.throws(() => extractFaceVector([],640,480));
  const p=points(); p[263] = p[33]; assert.throws(() => extractFaceVector(p,640,480));
  const q=points(); q[10].x=NaN; assert.throws(() => extractFaceVector(q,640,480));
  assert.throws(() => extractFaceVector(points(),0,480));
});
