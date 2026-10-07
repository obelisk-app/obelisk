import type { ReactNode } from 'react';

/** A small card in the middle of a black page: the room's loading and not-a-member states. */
export default function CenteredPanel({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
        {children}
      </div>
    </div>
  );
}
