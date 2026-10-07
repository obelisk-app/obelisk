'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useServerScreen } from '@/hooks/shell/mobile/screens/server/useServerScreen';
import { MobileServerRail } from '../../rail/MobileServerRail';
import { MobileServerBanner } from '../../rail/MobileServerBanner';
import { AddRelaySheet } from '../../sheets/relay/AddRelaySheet';
import { CreateChannelSheet } from '../../sheets/channel/CreateChannelSheet';
import { RelayMenuSheet } from '../../sheets/relay/RelayMenuSheet';
import { ServerChannelList } from './ServerChannelList';

/**
 * The phone server tab: the relay rail, the active space's banner over its
 * channel list, and the add-relay, new-channel and relay-menu sheets. State
 * and actions are `useServerScreen`.
 */
export function ServerScreen({
  go,
  selectGroup,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
}) {
  const { channelListRef, ...vm } = useServerScreen(selectGroup);

  return (
    <div className="screen active" data-screen="server">
      <div className="server-mobile-layout">
        <MobileServerRail
          relays={vm.relays}
          activeRelay={vm.relay}
          onSelectRelay={vm.selectRelay}
          onAddRelay={vm.openAddRelay}
          onLongPress={vm.openRelayMenu}
        />

        <section className="server-channel-pane" data-testid="mobile-channel-menu">
          <MobileServerBanner
            label={vm.space.label}
            relayUrl={vm.relay}
            iconUrl={vm.space.icon}
            bannerUrl={vm.space.banner}
            onSearch={() => go('search')}
            onCreateChannel={vm.openCreateChannel}
            onOpenMenu={vm.openActiveRelayMenu}
          />

          <div className="channel-list native-scroll-y" ref={channelListRef}>
            <ServerChannelList vm={vm} />
          </div>
        </section>
      </div>

      {vm.addRelayOpen && <AddRelaySheet close={vm.closeAddRelay} />}
      {vm.createChannelOpen && (
        <CreateChannelSheet
          relayLabel={vm.space.label}
          close={vm.closeCreateChannel}
          onCreated={vm.onChannelCreated}
        />
      )}
      {vm.relayMenuFor && (
        <RelayMenuSheet
          close={vm.closeRelayMenu}
          relayUrl={vm.relayMenuFor.url}
          label={vm.relayMenuFor.label}
          iconUrl={vm.relayMenuFor.iconUrl}
          isAdmin={vm.operator.isRelayOperator}
          branding={vm.operator.branding}
          emojiSet={vm.operator.emojiSet}
          roles={vm.operator.relayRoles}
          layout={vm.operator.layout}
          rootChannels={vm.roots}
        />
      )}
    </div>
  );
}
