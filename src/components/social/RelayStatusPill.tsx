'use client';

/**
 * Relay connectivity, in the header, where the other state indicators live.
 *
 * The status store has been live for a while, but the only surfaces reading
 * it were the relay settings panel — the place you open *after* you already
 * suspect something is wrong — and briefly a box in the feed's side column.
 * An empty feed and a feed whose relays all dropped looked identical.
 *
 * It sits in the header alongside the connection/signer state, and it also
 * starts the watcher, so status is live from the moment the app mounts
 * rather than from the moment you go looking for it.
 *
 * Clicking opens the per-relay breakdown rather than routing into settings:
 * the question behind the click is "which one is down", and that answer fits
 * in a popover.
 *
 * That popover is portalled (`AnchoredMenu`). Absolutely positioned inside
 * the header it painted *underneath* the bar: the header and the surfaces
 * below it establish their own stacking contexts, so a z-index on the panel
 * only ranked it within the header. Fixed coordinates on `document.body`
 * rank it against the page instead.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import AnchoredMenu from './AnchoredMenu';
import {
  getRelayStatuses,
  probeRelay,
  relayStatusSummary,
  subscribeRelayStatus,
  watchRelays,
  type RelayState,
} from '@/lib/social/relay-status';
import { normalizeRelayUrl } from '@/lib/social/relays';
import { useConnectionState, useRelayAccess } from '@/lib/nostr-bridge';
import { useTranslation } from '@/i18n/context';

const DOT: Record<RelayState, string> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  unknown: 'bg-lc-border',
  failed: 'bg-red-500',
  offline: 'bg-lc-muted',
};

export default function RelayStatusPill({
  relays,
  activeRelay,
  onOpenSettings,
  compact = false,
}: {
  relays: readonly string[];
  /**
   * The NIP-29 relay this session is bound to. It's a different question
   * from "are my social relays up" — it's the one that has to be connected
   * AND authenticated for the chat to work at all — so the popover answers
   * both rather than making people guess which relay a red dot refers to.
   */
  activeRelay?: string | null;
  /** Where "manage these" goes, when the host has somewhere to send it. */
  onOpenSettings?: () => void;
  /** Dot only — for a header with no room for the count. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const connection = useConnectionState();
  const access = useRelayAccess(activeRelay ?? null);

  // The header is the surface that's always mounted, so it owns the watcher.
  // `watchRelays` is idempotent; settings calls it too.
  useEffect(() => { watchRelays(relays); }, [relays]);

  const summary = useMemo(() => relayStatusSummary(relays, statuses), [relays, statuses]);

  const label = summary.state === 'offline'
    ? t('social.relayOffline')
    : `${summary.connected}/${summary.total} ${t('social.relayCount')}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg text-[11px] text-lc-muted transition-colors hover:bg-lc-border/40 hover:text-lc-white ${
          compact ? 'h-7 w-7 justify-center' : 'px-2 py-1'
        }`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        data-testid="relay-status-pill"
        data-state={summary.state}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[summary.state]}`} aria-hidden="true" />
        {!compact && <span className="tabular-nums">{summary.connected}/{summary.total}</span>}
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={272}
        testId="relay-status-popover"
      >
        <div className="p-1">
          {activeRelay && (
            <>
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
                {t('social.thisRelay')}
              </p>
              <div className="px-2.5 py-1.5" data-testid="relay-status-active" data-access={access}>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      access === 'ok' ? 'bg-lc-green'
                        : access === 'authenticating' ? 'bg-amber-400 animate-pulse'
                          : access === 'unknown' ? 'bg-lc-border' : 'bg-red-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-lc-white">
                    {shortHost(activeRelay)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-lc-muted">{connection}</span>
                </div>
                {/* AUTH is the difference between "connected" and "can read
                    this relay's groups" — a relay can be up and still hand
                    back nothing until the challenge is answered. */}
                <p className="pl-4 pt-0.5 text-[10px] text-lc-muted" data-testid="relay-status-auth">
                  {t(`social.auth.${access}`)}
                </p>
              </div>
              <div className="my-1 h-px bg-lc-border" aria-hidden="true" />
            </>
          )}
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
            {t('social.relays')}
          </p>
          {relays.map((relay) => {
            const url = normalizeRelayUrl(relay);
            const status = url ? statuses[url] : undefined;
            const state = status?.state ?? 'unknown';
            return (
              <div
                key={relay}
                className="flex items-center gap-2 px-2.5 py-1.5"
                data-testid="relay-status-row"
                data-state={state}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-lc-white">
                  {shortHost(relay)}
                </span>
                {/* Latency says it answers; the count says it's earning its slot. */}
                <span className="shrink-0 font-mono text-[10px] text-lc-muted">
                  {status?.latencyMs !== null && status?.latencyMs !== undefined && `${status.latencyMs}ms`}
                  {status && status.notes > 0 && ` · ${status.notes}`}
                </span>
                {state === 'failed' && (
                  <button
                    type="button"
                    onClick={() => void probeRelay(relay)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-lc-green hover:bg-white/5"
                    data-testid="relay-retry"
                  >
                    {t('common.retry')}
                  </button>
                )}
              </div>
            );
          })}
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-[11px] text-lc-green hover:bg-white/5"
              data-testid="relay-status-manage"
            >
              {t('social.relaySettings')}
            </button>
          )}
        </div>
      </AnchoredMenu>
    </>
  );
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
