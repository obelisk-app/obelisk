'use client';

import { useHistoryPill } from './hooks/useHistoryPill';

interface HistoryPaginationStatusProps {
  readonly loading: boolean;
  readonly reachedStart: boolean;
  readonly atTop: boolean;
  readonly loadingLabel: string;
  readonly endLabel: string;
}

export default function HistoryPaginationStatus({
  loading,
  reachedStart,
  atTop,
  loadingLabel,
  endLabel,
}: HistoryPaginationStatusProps) {
  const { mounted, active, mode } = useHistoryPill(loading, reachedStart, atTop);
  if (!mounted) return null;
  return (
    <div
      className={[
        'pointer-events-none absolute left-1/2 top-3 z-20 flex min-h-8 -translate-x-1/2 items-center justify-center gap-2',
        'rounded-full border border-lc-border bg-lc-dark/95 px-3 py-1.5 text-center text-xs text-lc-muted shadow-lg backdrop-blur',
        'transition-all duration-200 ease-out',
        active ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
      ].join(' ')}
      role={mode === 'loading' ? 'status' : undefined}
      data-testid={mode === 'loading' ? 'messages-history-loading' : 'messages-history-end'}
    >
      {mode === 'loading' && (
        <span
          className="lc-spinner"
          style={{ width: 14, height: 14, borderWidth: 2 }}
          aria-hidden="true"
        />
      )}
      <span>{mode === 'loading' ? loadingLabel : endLabel}</span>
    </div>
  );
}
