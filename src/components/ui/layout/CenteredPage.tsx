import type { ReactNode } from 'react';

/** A whole page that holds one small card in its middle, on black: the voice join form and the voice room's waiting states. */
export default function CenteredPage({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">{children}</div>;
}
