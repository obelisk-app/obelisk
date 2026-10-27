'use client';

import { useTranslations } from 'next-intl';
import type { RelayAccessState } from '@/services/nostr-bridge';
import { useChannelListEmptyReason } from '@/hooks/shell/mobile/screens/server/useChannelListEmptyState';
import RelayAccessHelp from '@/components/relay/RelayAccessHelp';

/**
 * Differentiated empty state for the channel list: loading, offline, whitelist, network, or none.
 * When the relay refused this key outright (`restricted`) it says how to get in: ask the
 * operator with the npub ready to copy, or pick another relay.
 */
export function ChannelListEmptyState({
  relayAccess,
  connectionState,
  metadataEose,
  onChooseRelay,
}: {
  relayAccess: RelayAccessState;
  connectionState: string;
  metadataEose: boolean;
  onChooseRelay: () => void;
}) {
  const t = useTranslations();
  const reason = useChannelListEmptyReason(relayAccess, connectionState, metadataEose);
  const isLoading = reason === 'loading';
  if (reason === 'whitelist' && relayAccess === 'restricted') {
    return (
      <div data-testid="channels-empty" data-state={reason} style={{ padding: '24px 12px' }}>
        <RelayAccessHelp onChooseRelay={onChooseRelay} />
      </div>
    );
  }
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
