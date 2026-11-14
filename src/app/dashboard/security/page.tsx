import Link from 'next/link';
import { KeyRound, ArrowLeft } from 'lucide-react';
import PasskeyManager from '@/components/PasskeyManager';
export const dynamic = 'force-dynamic';
export default function SecurityPage() {
  const enabled = process.env.ENABLE_EXPERIMENTAL_PASSKEYS === 'true';
  return <main className="security-page"><div className="security-shell"><Link href="/" className="security-back"><ArrowLeft size={15}/> Back to OptiAuth</Link><div className="security-heading"><div className="security-icon"><KeyRound size={25}/></div><div><span>ACCOUNT SECURITY</span><h1>Manage your passkeys</h1><p>Experimental credential management for your account.</p></div></div><div className="content-card security-card">{enabled ? <PasskeyManager/> : <div className="security-disabled"><h2>Passkeys are disabled</h2><p>This experimental feature is off by default. An administrator must configure and test it before use.</p></div>}</div><p className="security-disclaimer">This feature is under development. It is not ready for production access control.</p></div></main>;
}
