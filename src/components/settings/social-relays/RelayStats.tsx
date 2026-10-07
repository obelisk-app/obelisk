import type { RelayStatus } from '@/services/social/relay-status';

/**
 * Latency and delivered-note count.
 *
 * The count is the number that actually answers "is this relay earning its
 * slot": a relay can be connected and contribute nothing.
 */
export default function RelayStats({ status }: { status?: RelayStatus }) {
  if (!status) return null;
  return (
    <span
      className="hidden shrink-0 items-center gap-2 font-mono text-[10px] text-lc-muted sm:flex"
      data-testid="relay-stats"
    >
      {status.latencyMs !== null && <span>{status.latencyMs}ms</span>}
      {status.notes > 0 && <span>{status.notes}</span>}
    </span>
  );
}
