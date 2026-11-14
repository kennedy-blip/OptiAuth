import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OptiAuth — Identity, in a blink', description: 'An eye geometry identity prototype.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
