'use client';

import RelayStatusBanner from '@/components/feedback/RelayStatusBanner';
import { useActivityIndicator } from '@/hooks/feedback/useActivityIndicator';
import ActivityRow from './ActivityRow';

/**
 * The bottom-right activity stack on desktop: the relay status row, then at
 * most one activity row (`useActivityIndicator` picks it).
 */
export default function ActivityIndicator({ hideSigning = false }: { hideSigning?: boolean }) {
  const visible = useActivityIndicator(hideSigning);
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[60] hidden max-w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 lg:flex"
      aria-live="polite"
      data-testid="activity-indicator"
    >
      <RelayStatusBanner hideAuthenticating={hideSigning} />
      {visible.map((e) => (
        <ActivityRow key={e.id} entry={e} />
      ))}
    </div>
  );
}
