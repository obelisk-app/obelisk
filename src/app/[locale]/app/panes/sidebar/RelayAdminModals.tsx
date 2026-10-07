'use client';

import { useState } from 'react';
import { useConfiguredRelays, type JsGroup } from '@/services/nostr-bridge';
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
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [emojisOpen, setEmojisOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const configuredRelays = useConfiguredRelays();
  return (
    <>
      {settingsOpen && isRelayOperator && (
        <RelaySettingsModal
          onClose={onCloseSettings}
          onBranding={() => setBrandingOpen(true)}
          onEmojis={() => setEmojisOpen(true)}
          onLayout={() => setLayoutOpen(true)}
          onMembers={() => setAdminPanelOpen(true)}
          onRoles={() => setRolesOpen(true)}
        />
      )}
      {layoutOpen && relay && isRelayOperator && (
        <ManageLayoutModal
          relayUrl={relay}
          layout={layout}
          channels={channels}
          onClose={() => setLayoutOpen(false)}
        />
      )}
      {brandingOpen && relay && isRelayOperator && (
        <RelayBrandingModal
          relayUrl={relay}
          branding={branding}
          onClose={() => setBrandingOpen(false)}
        />
      )}
      {emojisOpen && relay && isRelayOperator && (
        <RelayEmojiAdminModal
          relayUrl={relay}
          emojiSet={emojiSet}
          configuredRelays={configuredRelays}
          onClose={() => setEmojisOpen(false)}
        />
      )}
      {adminPanelOpen && isRelayOperator && (
        <RelayAdminPanel onClose={() => setAdminPanelOpen(false)} />
      )}
      {rolesOpen && relay && isRelayOperator && (
        <RelayRolesAdminModal
          relayUrl={relay}
          roles={relayRoles}
          onClose={() => setRolesOpen(false)}
        />
      )}
    </>
  );
}
