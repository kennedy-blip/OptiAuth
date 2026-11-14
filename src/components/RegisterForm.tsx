'use client';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import EyeScanner from './EyeScanner';
import { registerProfile } from '@/app/actions/auth';
export default function RegisterForm() {
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [error, setError] = useState(''), [success, setSuccess] = useState(false), [pending, setPending] = useState(false);
  const [consent, setConsent] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!embedding || !consent) return;
    const form = new FormData(e.currentTarget); setPending(true); setError('');
    try { const result = await registerProfile({ fullName: String(form.get('fullName')), email: String(form.get('email')), phone: String(form.get('phone')), organization: String(form.get('organization')), embedding });
    if (result.ok) setSuccess(true); else setError(result.error); } catch { setError('The request could not be completed. Please try again.'); } finally { setPending(false); }
  }
  if (success) return <div className="success-state"><div className="success-icon"><CheckCircle2 size={30}/></div><h2>You’re all set.</h2><p>Your profile and eye signature have been saved. You can now try comparing a signature.</p><button className="secondary-button" onClick={() => { setSuccess(false); setEmbedding(null); setConsent(false); }}>Enroll another profile</button></div>;
  return <form onSubmit={submit} className="form-layout">
    <div className="section-heading"><span className="section-number">01</span><div><h2>Personal details</h2><p>Let’s start with the basics.</p></div></div>
    <div className="fields"><label>Full name <span>*</span><input name="fullName" placeholder="e.g. Alex Morgan" required maxLength={120}/></label><label>Email address <span>*</span><input name="email" type="email" placeholder="alex@example.com" required maxLength={254}/></label><label>Phone number <em>Optional</em><input name="phone" type="tel" placeholder="+1 (555) 000-0000" maxLength={40}/></label><label>Organization / role <em>Optional</em><input name="organization" placeholder="e.g. Acme, Designer" maxLength={120}/></label></div>
    <div className="section-heading scan-heading"><span className="section-number">02</span><div><h2>Eye signature</h2><p>A quick scan to create your unique profile.</p></div></div>
    <EyeScanner onCapture={setEmbedding} onReset={() => setEmbedding(null)}/>
    <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/> <span>I consent to storing my eye geometry and profile for this prototype.</span></label>
    {error && <div role="alert" className="alert">{error}</div>}
    <button className="primary-button" disabled={!embedding || !consent || pending} type="submit">{pending ? 'Saving profile…' : 'Save profile'} <ArrowRight size={17}/></button>
    <p className="form-note"><LockKeyhole size={14}/> Your video is processed locally. No photos are stored.</p>
  </form>;
}
