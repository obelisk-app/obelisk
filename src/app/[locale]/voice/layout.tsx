import type { ReactNode } from 'react';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/** Shared dynamic-document policy; each page owns only the translations its UI needs. */
export default function VoiceLayout({ children }: { children: ReactNode }) {
  return children;
}
