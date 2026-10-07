'use client';

/** Relay status row for the unified bottom-right activity stack. */

import { useRelayStatusBanner } from '@/hooks/feedback/useRelayStatusBanner';
import type { Severity } from '@/utils/relay/relay-status';

const SEVERITY_CLASSES: Record<Severity, string> = {
  info: 'bg-lc-card/60 border-lc-border text-lc-white',
  warn: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200',
  error: 'bg-red-500/10 border-red-500/40 text-red-200',
};

const SPINNER_CLASSES: Record<Severity, string> = {
  info: 'border-lc-green/30 border-t-lc-green',
  warn: 'border-yellow-300/30 border-t-yellow-200',
  error: 'border-red-300/30 border-t-red-200',
};

/** Shared relay row inside the bottom-right activity stack. */
export default function RelayStatusBanner({ hideAuthenticating = false }: { hideAuthenticating?: boolean }) {
  const status = useRelayStatusBanner(hideAuthenticating);
  if (!status) return null;
  return (
    <div
      data-testid={status.testId}
      data-state={status.state}
      data-severity={status.severity}
      className={'pointer-events-auto flex items-start gap-3 rounded-xl border px-3 py-2 text-xs shadow-2xl backdrop-blur ' + SEVERITY_CLASSES[status.severity]}
    >
      {status.spinner ? (
        <span
          className={`mt-1 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 ${SPINNER_CLASSES[status.severity]}`}
          aria-hidden
        />
      ) : (
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${status.severity === 'warn' ? 'bg-yellow-400' : 'bg-red-400'} animate-pulse`}
          aria-hidden
        />
      )}
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{status.label}</div>
        {status.detail && <div className="mt-0.5 text-[11px] leading-snug opacity-80">{status.detail}</div>}
      </div>
    </div>
  );
}
