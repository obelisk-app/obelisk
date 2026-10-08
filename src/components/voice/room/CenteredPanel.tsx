import type { ReactNode } from 'react';
import CenteredPage from '@/components/ui/layout/CenteredPage';

/** A small card in the middle of a black page: the room's loading and not-a-member states. */
export default function CenteredPanel({ children }: { children: ReactNode }) {
  return (
    <CenteredPage>
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
        {children}
      </div>
    </CenteredPage>
  );
}
