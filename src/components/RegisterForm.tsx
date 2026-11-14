'use client';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import FaceScanner from './FaceScanner';
import { registerProfile } from '@/app/actions/auth';
export default function RegisterForm() {
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(false), [pending, setPending] = useState(false);
  const [consent, setConsent] = useState(false), [detailsValid, setDetailsValid] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!embedding || !consent) return;
    const form = new FormData(e.currentTarget); setPending(true); setError('');
    try { const result = await registerProfile({ fullName: String(form.get('fullName')), email: String(form.get('email')), phone: String(form.get('phone')), organization: String(form.get('organization')), embedding });
    if (result.ok) setSuccess(true); else setError(result.error); } catch { setError('The request could not be completed. Please try again.'); } finally { setPending(false); }
  }
  if (success) return <div className="success-state"><div className="success-icon"><CheckCircle2 size={30}/></div><h2>You’re all set.</h2><p>Your profile and face signature have been saved. You can now try comparing a signature.</p><button className="secondary-button" onClick={() => { setSuccess(false); setEmbedding(null); setConsent(false); }}>Enroll another profile</button></div>;
  return <form onSubmit={submit} onChange={e => { const valid = e.currentTarget.checkValidity(); setDetailsValid(valid); if (!valid) setEmbedding(null); }} className="form-layout">
    <div className="section-heading"><span className="section-number">01</span><div><h2>Personal details</h2><p>Let’s start with the basics.</p></div></div>
    <div className="fields"><label>Full name <span>*</span><input name="fullName" placeholder="e.g. Alex Morgan" required maxLength={120}/></label><label>Email address <span>*</span><input name="email" type="email" placeholder="alex@example.com" required maxLength={254}/></label><label>Phone number <em>Optional</em><input name="phone" type="tel" placeholder="+1 (555) 000-0000" maxLength={40}/></label><label>Organization / role <em>Optional</em><input name="organization" placeholder="e.g. Acme, Designer" maxLength={120}/></label></div>
    <div className="section-heading scan-heading"><span className="section-number">02</span><div><h2>Face signature</h2><p>A quick scan to create a facial geometry profile.</p></div></div>
    <label className="consent"><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) setEmbedding(null); }}/> <span>I consent to storing my face geometry and profile for this prototype.</span></label>
    <p className="form-note">Complete the required fields and consent before starting the camera.</p>
    {detailsValid && consent ? <FaceScanner onCapture={setEmbedding} onReset={() => setEmbedding(null)}/> : <FaceScanner key="disabled" disabled onCapture={setEmbedding} onReset={() => setEmbedding(null)}/>}
    {error && <div role="alert" className="alert">{error}</div>}
    <button className="primary-button" disabled={!embedding || !consent || pending} type="submit">{pending ? 'Saving profile…' : 'Save profile'} <ArrowRight size={17}/></button>
    <p className="form-note"><LockKeyhole size={14}/> Your video is processed locally. No photos are stored.</p>
  </form>;
}
