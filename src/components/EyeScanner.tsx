'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, RefreshCw, ScanFace } from 'lucide-react';
import { createEyeLandmarker, eyeAspectRatio, eyeCenters, extractEyeVector } from '@/lib/eyeBiometrics';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

type Props = { onCapture: (embedding: number[]) => void; onReset?: () => void };
export default function EyeScanner({ onCapture, onReset }: Props) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onCapture); callback.current = onCapture;
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Starting camera');
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!active) return;
    let stopped = false, frame = 0, stream: MediaStream | undefined, landmarker: FaceLandmarker | undefined;
    let blinked = false, lastTime = -1;
    setStatus('Starting camera'); setError(''); setLocked(false);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires a secure connection (HTTPS) and a supported browser.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current; if (!el) return;
        el.srcObject = stream; await el.play();
        setStatus('Loading eye tracker');
        landmarker = await createEyeLandmarker();
        if (stopped) { landmarker.close(); return; }
        setStatus('Position eyes in frame');
        const tick = () => {
          if (stopped || !landmarker || !video.current) return;
          const v = video.current, c = canvas.current;
          try {
            if (v.readyState >= 2 && v.currentTime !== lastTime) {
              lastTime = v.currentTime;
              const result = landmarker.detectForVideo(v, performance.now());
              const points = result.faceLandmarks[0];
              if (c) {
                c.width = v.videoWidth; c.height = v.videoHeight;
                const ctx = c.getContext('2d');
                if (ctx && points?.length >= 478) {
                  ctx.strokeStyle = '#b5ffb4'; ctx.lineWidth = Math.max(2, c.width / 500);
                  for (const p of eyeCenters(points)) { ctx.beginPath(); ctx.arc(p.x*c.width, p.y*c.height, c.width*0.025, 0, Math.PI*2); ctx.stroke(); }
                }
              }
              if (!points || points.length < 478) { blinked = false; setStatus('Position eyes in frame'); }
              else {
                const ear = eyeAspectRatio(points);
                if (ear < 0.18) blinked = true;
                if (blinked && ear > 0.25) {
                  const embedding = extractEyeVector(points);
                  setLocked(true); setStatus('Eye signature locked'); callback.current(embedding);
                  stream?.getTracks().forEach(t => t.stop()); landmarker.close(); landmarker = undefined; return;
                }
                setStatus('Blink to verify liveness');
              }
            }
          } catch { stream?.getTracks().forEach(t => t.stop()); landmarker?.close(); landmarker = undefined; setError('Eye tracking was interrupted. Please try again.'); return; }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        stream?.getTracks().forEach(t => t.stop());
        landmarker?.close(); landmarker = undefined;
        if (stopped) return;
        const name = e instanceof Error ? e.name : '';
        setError(name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in your browser settings and try again.' : name === 'NotFoundError' ? 'No camera found. Connect a camera and try again.' : e instanceof Error ? e.message : 'Could not start the camera.');
      }
    }
    void start();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); landmarker?.close(); if (video.current) video.current.srcObject = null; };
  }, [attempt, active]);
  const reset = () => { onReset?.(); setAttempt(n => n+1); };
  if (!active) return <div className="scanner-start"><Camera size={24}/><strong>Ready when you are</strong><p>Your browser will ask for camera permission. Video stays on this device.</p><button type="button" onClick={() => setActive(true)}>Enable camera</button></div>;
  return <div className="scanner">
    <div className="camera-view">
      <video ref={video} playsInline muted autoPlay className="camera-video" />
      <canvas ref={canvas} className="camera-canvas" />
      <div className="scan-corners"><i/><i/><i/><i/></div>
      <div className="camera-top"><span><span className="live-dot"/> {locked ? 'CAPTURED' : 'LIVE CAMERA'}</span><ScanFace size={18}/></div>
      {!error && <div className="camera-prompt"><span className="prompt-icon">{locked ? <Check size={18}/> : <ScanFace size={18}/>}</span><div><strong>{status}</strong><small>{locked ? 'Your eye signature is ready' : 'Keep your face centered and look straight ahead'}</small></div></div>}
      {error && <div className="camera-error"><CameraOff size={26}/><strong>Camera unavailable</strong><p>{error}</p><button type="button" onClick={reset}>Try again</button></div>}
    </div>
    <div className="scanner-footer"><span><Camera size={15}/> {locked ? 'Capture complete' : 'Your camera stays on this device'}</span><button type="button" onClick={reset}><RefreshCw size={14}/> Retake scan</button></div>
  </div>;
}
