import type { Viewport } from 'next';
import type { ReactNode } from 'react';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/** A call screen, like the app shell: no page zoom. */
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

/** Shared viewport policy; each page owns only the translations its UI needs. */
export default function VoiceLayout({ children }: { children: ReactNode }) {
  return children;
}
