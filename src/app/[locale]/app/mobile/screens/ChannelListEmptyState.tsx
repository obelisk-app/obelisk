'use client';

import { useTranslations } from 'next-intl';
import type { RelayAccessState } from '@/services/nostr-bridge';
import { useChannelListEmptyReason } from '@/hooks/app/mobile/screens/server/useChannelListEmptyState';

/** Differentiated empty state for the channel list: loading, offline, whitelist, network, or none. */
export function ChannelListEmptyState({
  relayAccess,
  connectionState,
  metadataEose,
}: {
  relayAccess: RelayAccessState;
  connectionState: string;
  metadataEose: boolean;
}) {
  const t = useTranslations();
  const reason = useChannelListEmptyReason(relayAccess, connectionState, metadataEose);
  const isLoading = reason === 'loading';
  return (
    <div
      style={{ padding: '10px 12px', color: 'var(--app-text-mute)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
      data-testid={isLoading ? 'channels-loading' : 'channels-empty'}
      data-state={reason}
    >
      {isLoading && <div className="lc-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />}
      <span>{t(`mobile.channelList.${reason}`)}</span>
    </div>
  );
}
