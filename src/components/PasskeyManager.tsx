'use client';
import { useCallback, useEffect, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { beginPasskeyAuthentication, beginPasskeyRegistration, finishPasskeyAuthentication, finishPasskeyRegistration, listPasskeys, revokePasskey } from '@/app/actions/passkeyAuth';

type Credential = { id: string; label: string; createdAt: string };
export default function PasskeyManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]), [label, setLabel] = useState('My passkey');
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [ready, setReady] = useState(false), [asserted, setAsserted] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await listPasskeys(); if (result.ok) { setCredentials(result.credentials); setReady(true); } else { setReady(false); setError('A valid Supabase session and configured passkey service are required.'); } }
    catch { setReady(false); setError('Unable to load passkeys.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function register() {
    setPending(true); setMessage(''); setError('');
    try {
      const begin = await beginPasskeyRegistration(); if (!begin.ok) throw new Error('Registration is unavailable. A recent sign-in is required.');
      const response = await startRegistration({ optionsJSON: begin.options });
      const result = await finishPasskeyRegistration(begin.challengeId, response, label);
      if (!result.ok) throw new Error('Passkey registration could not be verified.');
      setMessage('Passkey registered.'); await refresh();
    } catch (e) { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Passkey registration was cancelled or timed out.' : e instanceof Error ? e.message : 'Unable to register passkey.'); }
    finally { setPending(false); }
  }
  async function authenticate() {
    setPending(true); setMessage(''); setError(''); setAsserted(false);
    try {
      const begin = await beginPasskeyAuthentication(); if (!begin.ok) throw new Error('Passkey verification is unavailable.');
      const response = await startAuthentication({ optionsJSON: begin.options });
      const result = await finishPasskeyAuthentication(begin.challengeId, response); if (!result.ok) throw new Error('Passkey verification failed.');
      setAsserted(true); setMessage('Passkey verified for this session. You can now revoke a credential.');
    } catch (e) { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Passkey verification was cancelled or timed out.' : e instanceof Error ? e.message : 'Unable to verify passkey.'); }
    finally { setPending(false); }
  }
  async function revoke(credential: Credential) {
    if (!window.confirm(`Revoke “${credential.label}”? You may lose access if it is your only passkey.`)) return;
    setPending(true); setMessage(''); setError('');
    try {
      const result = await revokePasskey(credential.id); if (!result.ok) throw new Error('Unable to revoke. Verify a passkey again and retry.');
      setAsserted(false); setMessage('Passkey revoked. Verify again for further changes.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to revoke passkey.'); }
    finally { setPending(false); }
  }
  return <div className="passkey-manager">
    <p className="passkey-copy">Passkeys use your device authenticator. An existing Supabase sign-in is required; registering a new passkey also requires a recent sign-in. Device labels are names you choose, not verified device identities.</p>
    {error && <div className="alert" role="alert">{error}</div>}{message && <div className="passkey-message" role="status">{message}</div>}
    <section className="passkey-section"><h2>Register a passkey</h2><label className="passkey-label">Device label<input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Personal laptop" /></label><button className="primary-button" type="button" onClick={register} disabled={!ready || pending || !label.trim()}>Register passkey</button></section>
    <section className="passkey-section"><div className="passkey-list-title"><div><h2>Your passkeys</h2><p>Verify with a passkey before revoking one.</p></div><button type="button" onClick={authenticate} disabled={!ready || pending || credentials.length === 0} className="secondary-button">Verify passkey</button></div>
      {ready && credentials.length === 0 && <p className="passkey-empty">No passkeys registered yet.</p>}
      <ul className="passkey-list">{credentials.map(credential => <li key={credential.id}><div><strong>{credential.label}</strong><small>Added {new Date(credential.createdAt).toLocaleDateString()}</small></div><button type="button" onClick={() => revoke(credential)} disabled={pending || !asserted} aria-label={`Revoke ${credential.label}`}>Revoke</button></li>)}</ul>
    </section>
  </div>;
}
