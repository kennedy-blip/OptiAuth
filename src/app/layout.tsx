import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OptiAuth — Facial geometry prototype', description: 'An experimental facial geometry comparison prototype.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
