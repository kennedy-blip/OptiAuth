'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, RefreshCw, ScanFace, Square } from 'lucide-react';
import { createEyeLandmarker, eyeAspectRatio, eyeCenters, extractEyeVector, horizontalGaze } from '@/lib/eyeBiometrics';
import { advanceLiveness, createLiveness, fuseEyeVectors, randomChallenges, type LivenessState } from '@/lib/liveness';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

type Props = { onCapture: (embedding: number[]) => void; onReset?: () => void; disabled?: boolean };
export default function EyeScanner({ onCapture, onReset, disabled = false }: Props) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const stopNow = useRef<() => void>(() => {});
  const callback = useRef(onCapture); callback.current = onCapture;
  const resetCallback = useRef(onReset); resetCallback.current = onReset;
  const [attempt, setAttempt] = useState(0), [active, setActive] = useState(false);
  const [status, setStatus] = useState('Starting camera'), [error, setError] = useState('');
  const [locked, setLocked] = useState(false), [progress, setProgress] = useState(0), [lighting, setLighting] = useState('Checking lighting');
  useEffect(() => {
    if (!active) return;
    let stopped = false, frame = 0, stream: MediaStream | undefined, landmarker: FaceLandmarker | undefined;
    let lastTime = -1, neutral: number | undefined, state: LivenessState | undefined, lastSample = 0, lightChecked = 0;
    const samples: number[][] = [];
    setStatus('Starting camera'); setError(''); setLocked(false); setProgress(0); setLighting('Checking lighting');
    const stopResources = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); stream = undefined; landmarker?.close(); landmarker = undefined; };
    stopNow.current = () => { stopped = true; stopResources(); };
    const onVisibility = () => { if (document.hidden) { stopped = true; stopResources(); resetCallback.current?.(); setActive(false); } };
    document.addEventListener('visibilitychange', onVisibility);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser.');
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped || document.hidden) { acquired.getTracks().forEach(t => t.stop()); return; }
        stream = acquired;
        const el = video.current; if (!el) { stopResources(); return; }
        el.srcObject = stream; await el.play();
        if (stopped) return;
        setStatus('Loading eye tracker');
        const tracker = await createEyeLandmarker();
        if (stopped) { tracker.close(); return; }
        landmarker = tracker;
        setStatus('Look straight ahead');
        const tick = () => {
          if (stopped || !landmarker || !video.current) return;
          const v = video.current, c = canvas.current, now = performance.now();
          try {
            // Timeout is enforced even if the face disappears or video stalls.
            if (state && now - state.startedAt >= 8000) throw new Error(state.phase === 'complete' ? 'Capture timed out. Please try again.' : 'Challenge timed out. Please try again.');
            if (v.readyState >= 2 && v.currentTime !== lastTime) {
              lastTime = v.currentTime;
              const points = landmarker.detectForVideo(v, now).faceLandmarks[0];
              if (c) {
                c.width = v.videoWidth; c.height = v.videoHeight;
                const ctx = c.getContext('2d');
                if (ctx && points?.length >= 478) {
                  ctx.strokeStyle = '#b5ffb4'; ctx.lineWidth = Math.max(2, c.width / 500);
                  for (const p of eyeCenters(points)) { ctx.beginPath(); ctx.arc(p.x*c.width, p.y*c.height, c.width*0.025, 0, Math.PI*2); ctx.stroke(); }
                }
              }
              if (now - lightChecked > 1000) {
                lightChecked = now;
                const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = 32; sampleCanvas.height = 24;
                const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
                if (ctx) { ctx.drawImage(v, 0, 0, 32, 24); const pixels = ctx.getImageData(0, 0, 32, 24).data; let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += 0.2126*pixels[i] + 0.7152*pixels[i+1] + 0.0722*pixels[i+2]; const lum = sum / (pixels.length / 4); setLighting(lum < 45 ? 'Low light' : lum > 220 ? 'Too bright' : 'Lighting looks okay'); }
              }
              if (!points || points.length < 478) { setStatus('Position eyes in frame'); if (samples.length) { samples.length = 0; lastSample = 0; } }
              else {
                const gaze = horizontalGaze(points), ear = eyeAspectRatio(points);
                if (neutral === undefined && ear > 0.25) { neutral = gaze; state = createLiveness(randomChallenges(), now); }
                if (state && neutral !== undefined && state.phase === 'waiting') {
                  // Preview is mirrored, so reverse image-coordinate displacement.
                  state = advanceLiveness(state, { ear, gaze: neutral - gaze, time: now });
                  setProgress(state.index / state.sequence.length);
                  if (state.phase === 'timeout') throw new Error('Challenge timed out. Please try again.');
                  if (state.phase === 'waiting') setStatus(state.sequence[state.index] === 'BLINK' ? 'Blink once' : state.sequence[state.index] === 'GAZE_LEFT' ? 'Look left, then center' : 'Look right, then center');
                }
                if (state?.phase === 'complete') {
                  setStatus(`Hold steady · capturing ${samples.length}/3`);
                  if (ear > 0.25 && Math.abs(gaze - (neutral ?? gaze)) < 0.05 && (samples.length === 0 || now - lastSample >= 400)) {
                    samples.push(extractEyeVector(points)); lastSample = now; setStatus(`Hold steady · capturing ${samples.length}/3`);
                    if (samples.length === 3) {
                      const embedding = fuseEyeVectors(samples);
                      setLocked(true); setStatus('Eye signature locked'); callback.current(embedding); stopResources(); return;
                    }
                  }
                }
              }
            }
          } catch (e) { stopResources(); setError(e instanceof Error ? e.message : 'Eye tracking was interrupted. Please try again.'); return; }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        stopResources(); if (stopped) return;
        const name = e instanceof Error ? e.name : '';
        setError(name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in your browser settings and try again.' : name === 'NotFoundError' ? 'No camera found. Connect a camera and try again.' : e instanceof Error ? e.message : 'Could not start the camera.');
      }
    }
    void start();
    return () => { stopNow.current = () => {}; stopped = true; document.removeEventListener('visibilitychange', onVisibility); stopResources(); if (video.current) video.current.srcObject = null; };
  }, [attempt, active]);
  const reset = () => { stopNow.current(); onReset?.(); setAttempt(n => n+1); };
  const stop = () => { stopNow.current(); onReset?.(); setActive(false); };
  if (!active) return <div className="scanner-start"><Camera size={24}/><strong>Ready when you are</strong><p>Your browser will ask for camera permission. Video stays on this device.</p><button type="button" disabled={disabled} onClick={() => setActive(true)}>Enable camera &amp; start check</button></div>;
  return <div className="scanner"><div className="camera-view"><video ref={video} playsInline muted autoPlay className="camera-video"/><canvas ref={canvas} className="camera-canvas"/><div className="scan-corners"><i/><i/><i/><i/></div><div className="camera-top"><span><span className="live-dot"/> {locked ? 'CAPTURED' : 'LIVE CAMERA'}</span><ScanFace size={18}/></div>{!error && <div className="camera-prompt"><span className="prompt-icon">{locked ? <Check size={18}/> : <ScanFace size={18}/>}</span><div><strong>{status}</strong><small>{lighting} · {Math.round(progress * 100)}% of prompts complete</small></div><progress aria-label="Challenge progress" max={1} value={progress}/></div>}{error && <div className="camera-error"><CameraOff size={26}/><strong>Scan unavailable</strong><p>{error}</p><button type="button" onClick={reset}>Try again</button></div>}</div><div className="scanner-footer"><span><Camera size={15}/> {locked ? 'Capture complete' : 'Camera stays on this device'}</span><div className="scanner-controls"><button type="button" onClick={reset}><RefreshCw size={14}/> Retake</button><button type="button" onClick={stop}><Square size={14}/> Stop camera</button></div></div></div>;
}
