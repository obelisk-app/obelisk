'use client';

import { useSyncExternalStore } from 'react';
import {
  getRelayStatuses,
  probeRelay,
  subscribeRelayStatus,
  type RelayState,
} from '@/services/social/relay-status';
import { normalizeRelayUrl } from '@/services/social/relays';
import { usePreferences } from '@/hooks/usePreferences';
import { openSettings } from '@/utils/open-settings';
import { useTranslations } from 'next-intl';
import WidgetCard from './WidgetCard';
import { shortHost } from '@/utils/relay-url/url-host';
import TextButton from '@/components/ui/TextButton';

/**
 * Where the feed's notes are coming from, and whether it is working.
 *
 * The header pill answers this in a popover, which is the right shape for a
 * glance. This is for the reader who is actively tuning their relay set and
 * wants it on screen while they scroll: the commonest cause of a thin feed
 * is a relay set nobody chose, and that is invisible until you look.
 *
 * It does not start the watcher; the pill owns that and is always mounted.
 */
const DOT: Record<RelayState, string> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  unknown: 'bg-lc-border',
  failed: 'bg-red-500',
  offline: 'bg-lc-muted',
};

export default function RelaysWidget() {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const statuses = useSyncExternalStore(subscribeRelayStatus, getRelayStatuses, getRelayStatuses);

  return (
    <WidgetCard
      title={t('social.relays')}
      testId="widget-relays"
      action={(
        <TextButton
          onClick={() => openSettings('relays')} className="shrink-0 text-[11px] font-medium"
          data-testid="widget-relays-manage"
        >
          {t('social.relaySettings')}
        </TextButton>
      )}
    >
      <ul>
        {relays.map((relay) => {
          const url = normalizeRelayUrl(relay);
          const status = url ? statuses[url] : undefined;
          const state = status?.state ?? 'unknown';
          return (
            <li
              key={relay}
              className="flex items-center gap-2 px-2 py-1.5"
              data-testid="widget-relay-row"
              data-state={state}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} role="img" aria-label={state} />
              <span className="min-w-0 flex-1 truncate text-xs text-lc-white">{shortHost(relay)}</span>
              {state === 'failed' ? (
                <TextButton
                  onClick={() => void probeRelay(relay)} className="shrink-0 px-1.5 py-0.5 text-[10px]"
                >
                  {t('common.retry')}
                </TextButton>
              ) : (
                <span className="shrink-0 font-mono text-[10px] text-lc-muted">
                  {status?.latencyMs != null && `${status.latencyMs}ms`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
