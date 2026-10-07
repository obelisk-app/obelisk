'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import type { RelayBranding } from '@/services/relay/relay-branding';
import type { RelayEmojiSet } from '@/services/relay/relay-emojis';
import type { RelayRoles } from '@/services/relay/relay-roles';
import RelayAdminPanel from '@/components/admin/relay-admin/RelayAdminPanel';
import RelayEmojiAdminModal from '@/components/admin/relay-emoji/RelayEmojiAdminModal';
import RelayRolesAdminModal from '@/components/admin/relay-roles/RelayRolesAdminModal';
import { ManageLayoutModal } from '../../modals/layout/ManageLayoutModal';
import { RelayBrandingModal } from '../../modals/relay/RelayBrandingModal';
import { RelaySettingsModal } from '../../modals/relay/RelaySettingsModal';
import { useRelayAdminModals } from '@/hooks/shell/panes/sidebar/useRelayAdminModals';

type Props = {
  relay: string;
  /** Operator-only: nothing here renders for anyone else. */
  isRelayOperator: boolean;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  layout: ChannelLayout;
  channels: ReadonlyArray<JsGroup>;
  branding: RelayBranding;
  emojiSet: RelayEmojiSet;
  relayRoles: RelayRoles;
};

/** The server-settings menu and the five operator editors it opens. */
export function RelayAdminModals({
  relay, isRelayOperator, settingsOpen, onCloseSettings, layout, channels, branding, emojiSet, relayRoles,
}: Props) {
  const vm = useRelayAdminModals();
  return (
    <>
      {settingsOpen && isRelayOperator && (
        <RelaySettingsModal
          onClose={onCloseSettings}
          onBranding={() => vm.open('branding')}
          onEmojis={() => vm.open('emojis')}
          onLayout={() => vm.open('layout')}
          onMembers={() => vm.open('members')}
          onRoles={() => vm.open('roles')}
        />
      )}
      {vm.opened.layout && relay && isRelayOperator && (
        <ManageLayoutModal
          relayUrl={relay}
          layout={layout}
          channels={channels}
          onClose={() => vm.close('layout')}
        />
      )}
      {vm.opened.branding && relay && isRelayOperator && (
        <RelayBrandingModal
          relayUrl={relay}
          branding={branding}
          onClose={() => vm.close('branding')}
        />
      )}
      {vm.opened.emojis && relay && isRelayOperator && (
        <RelayEmojiAdminModal
          relayUrl={relay}
          emojiSet={emojiSet}
          configuredRelays={vm.configuredRelays}
          onClose={() => vm.close('emojis')}
        />
      )}
      {vm.opened.members && isRelayOperator && (
        <RelayAdminPanel onClose={() => vm.close('members')} />
      )}
      {vm.opened.roles && relay && isRelayOperator && (
        <RelayRolesAdminModal
          relayUrl={relay}
          roles={relayRoles}
          onClose={() => vm.close('roles')}
        />
      )}
    </>
  );
}
