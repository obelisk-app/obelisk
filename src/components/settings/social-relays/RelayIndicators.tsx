import type { RelayState, RelayStatus } from '@/services/social/relay-status';

const DOT_CLASS: Record<RelayState, string> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  failed: 'bg-red-500',
  offline: 'bg-lc-muted',
  unknown: 'bg-lc-border',
};

/**
 * The dot.
 *
 * Colour alone would be unreadable for anyone colour-blind and invisible to
 * a screen reader, so the state is also the accessible name and the title.
 */
export function RelayDot({ status, onRetry }: { status?: RelayStatus; onRetry?: () => void }) {
  const state = status?.state ?? 'unknown';
  const className = DOT_CLASS[state];
  // A failed relay is the one case where the dot should do something: the
  // fix is almost always "try again", and hunting for a separate button is
  // friction for a one-click action.
  if (state === 'failed' && onRetry) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
        aria-label={`${state} - retry`}
        title={`${state} - retry`}
        data-testid="relay-dot"
        data-state={state}
      />
    );
  }

  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      role="img"
      aria-label={state}
      title={state}
      data-testid="relay-dot"
      data-state={state}
    />
  );
}

/**
 * Latency and delivered-note count.
 *
 * The count is the number that actually answers "is this relay earning its
 * slot": a relay can be connected and contribute nothing.
 */
export function RelayStats({ status }: { status?: RelayStatus }) {
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
