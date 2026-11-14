import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export type Landmark = NormalizedLandmark;
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function createEyeLandmarker(): Promise<FaceLandmarker> {
  const files = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
    runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
  });
}
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
// Outer corner, inner corner, upper/lower eyelid pairs.
const EYES = [
  { corners: [33, 133], lids: [159, 145, 158, 153], iris: [468, 469, 470, 471, 472], contour: [33, 133, 160, 159, 158, 157, 173, 155, 154, 153, 145, 144, 163, 7] },
  { corners: [362, 263], lids: [386, 374, 385, 380], iris: [473, 474, 475, 476, 477], contour: [362, 263, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390, 249] },
] as const;
export function eyeAspectRatio(points: Landmark[]): number {
  return EYES.reduce((sum, eye) => {
    const [a,b] = eye.corners; const [u,l,u2,l2] = eye.lids;
    return sum + (distance(points[u], points[l]) + distance(points[u2], points[l2])) / (2 * Math.max(distance(points[a], points[b]), 1e-6));
  }, 0) / 2;
}
/** A deterministic geometric descriptor, not a validated biometric template. */
export function extractEyeVector(points: Landmark[]): number[] {
  if (points.length < 478) throw new Error('Iris landmarks are unavailable.');
  const interPupil = Math.max(distance(points[468], points[473]), 1e-6);
  const features: number[] = [];
  for (const eye of EYES) {
    const a = points[eye.corners[0]], b = points[eye.corners[1]], center = points[eye.iris[0]];
    const width = Math.max(distance(a, b), 1e-6);
    const ux = (b.x-a.x)/width, uy = (b.y-a.y)/width;
    // Local eye coordinate system removes translation, scale, and in-plane rotation.
    for (const index of eye.contour) {
      const p = points[index], dx = p.x-center.x, dy = p.y-center.y;
      features.push((dx*ux + dy*uy)/width, (-dx*uy + dy*ux)/width);
    }
    const irisDiameter = (distance(points[eye.iris[1]], points[eye.iris[3]]) + distance(points[eye.iris[2]], points[eye.iris[4]]))/2;
    features.push(irisDiameter/width, distance(center,a)/width, distance(center,b)/width, width/interPupil);
  }
  const norm = Math.hypot(...features);
  if (!Number.isFinite(norm) || norm < 1e-8) throw new Error('Unable to extract eye geometry.');
  return features.map(value => value / norm);
}
export function eyeCenters(points: Landmark[]) { return [points[468], points[473]]; }
/** Horizontal iris position in image coordinates; not a calibrated gaze tracker. */
export function horizontalGaze(points: Landmark[]): number {
  if (points.length < 478) throw new Error('Iris landmarks are unavailable.');
  const ratio = (center: number, left: number, right: number) => {
    const a = points[left], b = points[right], p = points[center];
    const dx = b.x - a.x, dy = b.y - a.y;
    const width2 = dx * dx + dy * dy;
    if (width2 < 1e-10) throw new Error('Eye landmarks are too close.');
    return ((p.x - a.x) * dx + (p.y - a.y) * dy) / width2;
  };
  // Both corner pairs run from lower to higher image x.
  return (ratio(468, 33, 133) + ratio(473, 362, 263)) / 2;
}
