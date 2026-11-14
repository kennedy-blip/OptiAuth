import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// 32 landmark positions: brows, eyes, nose, lips, cheeks and jaw.
// This is a simple 2D geometric descriptor, not a trained or validated face model.
const FEATURES = [10, 67, 109, 338, 297, 33, 133, 362, 263, 70, 105, 334, 300, 1, 4, 2, 98, 327, 61, 291, 13, 14, 234, 454, 127, 356, 172, 397, 136, 365, 152, 199] as const;

/** A scale/translation/in-plane-rotation normalized 64-component face vector. */
export function extractFaceVector(points: readonly NormalizedLandmark[], width: number, height: number): number[] {
  if (points.length < 468 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Face landmarks are unavailable.');
  const left = points[33], right = points[263];
  const ax = left.x * width, ay = left.y * height, bx = right.x * width, by = right.y * height;
  const dx = bx - ax, dy = by - ay, scale = Math.hypot(dx, dy);
  if (!Number.isFinite(scale) || scale < 1e-6) throw new Error('Unable to measure face geometry.');
  const ux = dx / scale, uy = dy / scale, ox = (ax + bx) / 2, oy = (ay + by) / 2;
  const vector: number[] = [];
  for (const index of FEATURES) {
    const point = points[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid face landmarks.');
    const x = point.x * width - ox, y = point.y * height - oy;
    vector.push((x * ux + y * uy) / scale, (-x * uy + y * ux) / scale);
  }
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm < 1e-8) throw new Error('Unable to extract face geometry.');
  return vector.map(value => value / norm);
}
