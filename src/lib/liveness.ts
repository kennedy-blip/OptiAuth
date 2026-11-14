/** Experimental client-side interaction checks. These do not prove liveness. */
export type Challenge = 'BLINK' | 'GAZE_LEFT' | 'GAZE_RIGHT';
export type Phase = 'waiting' | 'complete' | 'timeout';
export type LivenessState = { sequence: readonly Challenge[]; index: number; startedAt: number; blinkClosed: boolean; gazeAway: boolean; phase: Phase };
export type Observation = { ear: number; gaze: number; time: number };
export const CHALLENGE_TIMEOUT_MS = 8000;
export function createLiveness(sequence: readonly Challenge[], now: number): LivenessState {
  if (!sequence.length) throw new Error('A challenge sequence is required.');
  return { sequence, index: 0, startedAt: now, blinkClosed: false, gazeAway: false, phase: 'waiting' };
}
export function randomChallenges(): Challenge[] {
  // Cryptographic randomness avoids predictable client-side prompts, but does
  // not make their completion trustworthy to the server.
  const values = new Uint32Array(2); crypto.getRandomValues(values);
  const gaze: Challenge = values[0] % 2 === 0 ? 'GAZE_LEFT' : 'GAZE_RIGHT';
  return values[1] % 2 === 0 ? ['BLINK', gaze] : [gaze, 'BLINK'];
}
export function advanceLiveness(state: LivenessState, observation: Observation): LivenessState {
  if (state.phase !== 'waiting') return state;
  if (observation.time - state.startedAt >= CHALLENGE_TIMEOUT_MS) return { ...state, phase: 'timeout' };
  if (!Number.isFinite(observation.ear) || !Number.isFinite(observation.gaze)) return state;
  const challenge = state.sequence[state.index];
  let blinkClosed = state.blinkClosed, gazeAway = state.gazeAway, done = false;
  if (challenge === 'BLINK') {
    if (observation.ear < 0.18) blinkClosed = true;
    if (blinkClosed && observation.ear > 0.25) done = true;
  } else {
    // Gaze values are relative to the calibrated neutral position. Directions
    // refer to the user's mirrored preview, not a clinical gaze measurement.
    if (challenge === 'GAZE_LEFT' ? observation.gaze < -0.10 : observation.gaze > 0.10) gazeAway = true;
    if (gazeAway && Math.abs(observation.gaze) < 0.05) done = true;
  }
  if (!done) return { ...state, blinkClosed, gazeAway };
  const index = state.index + 1;
  return { ...state, index, startedAt: observation.time, blinkClosed: false, gazeAway: false, phase: index === state.sequence.length ? 'complete' : 'waiting' };
}
/** Average three normalized vectors and reject inconsistent samples. */
export function fuseFaceVectors(vectors: readonly (readonly number[])[], maxDistance = 0.06): number[] {
  if (vectors.length !== 3 || !Number.isFinite(maxDistance) || maxDistance < 0) throw new Error('Three valid samples are required.');
  const normalized = vectors.map(v => {
    if (v.length !== 64 || !v.every(Number.isFinite)) throw new Error('Invalid sample.');
    const norm = Math.hypot(...v);
    if (!Number.isFinite(norm) || norm < 1e-8) throw new Error('Invalid sample.');
    return v.map(n => n / norm);
  });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const dot = normalized[i].reduce((sum, value, k) => sum + value * normalized[j][k], 0);
    if (1 - dot > maxDistance + 1e-12) throw new Error('Samples were inconsistent. Please hold steady and try again.');
  }
  const mean = normalized[0].map((_, i) => (normalized[0][i] + normalized[1][i] + normalized[2][i]) / 3);
  const norm = Math.hypot(...mean);
  if (!Number.isFinite(norm) || norm < 1e-8) throw new Error('Invalid sample average.');
  return mean.map(n => n / norm);
}
