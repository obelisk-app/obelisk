'use client';

/**
 * Relay connectivity, where you can actually see it.
 *
 * The status store has been live for a while, but the only surface reading
 * it was the relay settings panel — the place you open *after* you already
 * suspect something is wrong. An empty feed and a feed whose relays all
 * dropped looked identical.
 *
 * This is the toolbar version: a dot, a count, and a click through to the
 * settings that explain it. It also starts the watcher, so status is live
 * from the moment the feed mounts rather than the moment you go looking.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  getRelayStatuses,
  relayStatusSummary,
  subscribeRelayStatus,
  watchRelays,
  type RelayState,
} from '@/lib/social/relay-status';
import { useTranslation } from '@/i18n/context';

const DOT: Record<RelayState, string> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  unknown: 'bg-lc-muted',
  failed: 'bg-red-500',
  offline: 'bg-red-500',
};

export default function RelayStatusPill({
  relays,
  onOpenSettings,
  compact = false,
}: {
  relays: readonly string[];
  onOpenSettings?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);

  // The feed is the surface people live on, so it owns the watcher. Settings
  // calls this too; `watchRelays` is idempotent.
  useEffect(() => { watchRelays(relays); }, [relays]);

  const summary = useMemo(() => relayStatusSummary(relays, statuses), [relays, statuses]);

  const label = summary.state === 'offline'
    ? t('social.relayOffline')
    : `${summary.connected}/${summary.total} ${t('social.relayCount')}`;

  const Tag = onOpenSettings ? 'button' : 'div';

  return (
    <Tag
      {...(onOpenSettings ? { type: 'button' as const, onClick: onOpenSettings } : {})}
      className={`flex shrink-0 items-center gap-1.5 rounded-full text-[11px] text-lc-muted transition-colors ${
        onOpenSettings ? 'hover:bg-white/5 hover:text-lc-white' : ''
      } ${compact ? 'px-1.5 py-1' : 'border border-lc-border px-2.5 py-1'}`}
      title={label}
      aria-label={label}
      data-testid="relay-status-pill"
      data-state={summary.state}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[summary.state]}`} aria-hidden="true" />
      {!compact && <span className="tabular-nums">{summary.connected}/{summary.total}</span>}
    </Tag>
  );
}
