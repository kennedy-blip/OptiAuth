'use client';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, UserRound, RotateCcw } from 'lucide-react';
import EyeScanner from './EyeScanner';
import { verifyEye } from '@/app/actions/auth';
type Profile = { full_name: string; email: string; phone: string | null; role_or_org: string | null; confidence: number };
export default function VerifyScanner() {
  const [embedding, setEmbedding] = useState<number[] | null>(null), [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState(''), [pending, setPending] = useState(false), [attempt, setAttempt] = useState(0);
  async function verify() {
    if (!embedding) return; setPending(true); setMessage('');
    const result = await verifyEye(embedding); setPending(false);
    if (!result.ok) setMessage(result.error); else if (!result.data) setMessage('Unrecognized Eye ID. Please try again or enroll a profile.'); else setProfile(result.data);
  }
  function reset() { setProfile(null); setEmbedding(null); setMessage(''); setAttempt(n => n+1); }
  if (profile) return <div className="profile-result"><div className="success-icon"><CheckCircle2 size={30}/></div><h2>Match found</h2><p>Your eye signature matched a registered profile.</p><div className="profile-card"><div className="profile-avatar"><UserRound size={23}/></div><div><strong>{profile.full_name}</strong><span>{profile.role_or_org || 'OptiAuth member'}</span></div><div className="confidence">{Math.round(profile.confidence*100)}% <small>similarity</small></div></div><div className="profile-detail"><span>Email</span><strong>{profile.email}</strong></div>{profile.phone && <div className="profile-detail"><span>Phone</span><strong>{profile.phone}</strong></div>}<button className="secondary-button" onClick={reset}><RotateCcw size={15}/> Scan again</button></div>;
  return <div className="form-layout verify-layout"><div className="section-heading"><span className="section-number">01</span><div><h2>Scan your eyes</h2><p>Look at the camera and blink when prompted.</p></div></div><EyeScanner key={attempt} onCapture={setEmbedding} onReset={() => { setEmbedding(null); setMessage(''); }}/>{message && <div role="alert" className="alert">{message}</div>}<button className="primary-button" disabled={!embedding || pending} onClick={verify}>{pending ? 'Checking signature…' : 'Verify my identity'} <ArrowRight size={17}/></button><p className="form-note">Only your eye geometry is used for matching.</p></div>;
}
