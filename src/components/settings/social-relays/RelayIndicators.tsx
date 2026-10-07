import type { RelayState, RelayStatus } from '@/services/social/relay-status';

/** The latency and note count beside the dot live in their own file; importers keep this path. */
export { default as RelayStats } from './RelayStats';

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
