'use client';

import { useCallTimer } from '@/hooks/call/useCallTimer';

/** How long the call has been up, ticking every second. */
export default function CallTimer({ since }: { since: number }) {
  const elapsed = useCallTimer(since);
  return <span data-testid="dm-call-timer">{elapsed}</span>;
}
