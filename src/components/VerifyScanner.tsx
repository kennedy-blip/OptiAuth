'use client';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import EyeScanner from './EyeScanner';
import { verifyEye } from '@/app/actions/auth';
export default function VerifyScanner() {
  const [embedding, setEmbedding] = useState<number[] | null>(null), [confidence, setConfidence] = useState<number | null>(null);
  const [message, setMessage] = useState(''), [pending, setPending] = useState(false), [attempt, setAttempt] = useState(0);
  async function verify() {
    if (!embedding) return; setPending(true); setMessage('');
    try {
      const result = await verifyEye(embedding);
      if (!result.ok) setMessage(result.error); else if (!result.data) setMessage('No matching signature was found. Please try again or enroll a profile.'); else setConfidence(result.data.confidence);
    } catch { setMessage('The request could not be completed. Please try again.'); }
    finally { setPending(false); }
  }
  function reset() { setConfidence(null); setEmbedding(null); setMessage(''); setAttempt(n => n+1); }
  if (confidence !== null) return <div className="profile-result"><div className="success-icon"><CheckCircle2 size={30}/></div><h2>Signature match found</h2><p>A similar signature was found ({Math.round(confidence*100)}% cosine similarity). This does not verify identity or sign you in.</p><button className="secondary-button" onClick={reset}><RotateCcw size={15}/> Scan again</button></div>;
  return <div className="form-layout verify-layout"><div className="section-heading"><span className="section-number">01</span><div><h2>Scan your eyes</h2><p>Look at the camera and blink when prompted.</p></div></div><EyeScanner key={attempt} onCapture={setEmbedding} onReset={() => { setEmbedding(null); setMessage(''); }}/>{message && <div role="alert" className="alert">{message}</div>}<button className="primary-button" disabled={!embedding || pending} onClick={verify}>{pending ? 'Checking signature…' : 'Compare signature'} <ArrowRight size={17}/></button><p className="form-note">Only your eye geometry is used for matching.</p></div>;
}
