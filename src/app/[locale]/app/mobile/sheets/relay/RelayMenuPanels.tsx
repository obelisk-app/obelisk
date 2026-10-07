'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { type ChannelLayout } from '@/services/relay/channel-layout';
import { type RelayBranding } from '@/services/relay/relay-branding';
import { type RelayEmojiSet } from '@/services/relay/relay-emojis';
import { type RelayRoles } from '@/services/relay/relay-roles';
import type { RelayMenuPanel } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';
import RelayAdminPanel from '@/components/admin/relay-admin/RelayAdminPanel';
import RelayEmojiAdminModal from '@/components/admin/relay-emoji/RelayEmojiAdminModal';
import RelayRolesAdminModal from '@/components/admin/relay-roles/RelayRolesAdminModal';
import { EditBrandingSheet } from './EditBrandingSheet';
import { ManageCategoriesSheet } from '../layout/ManageCategoriesSheet';

/** The admin panel the relay menu stacks over itself, when one is open. */
export function RelayMenuPanels({
  panel,
  close,
  relayUrl,
  relays,
  branding,
  emojiSet,
  roles,
  layout,
  rootChannels,
}: {
  panel: RelayMenuPanel | null;
  close: () => void;
  relayUrl: string;
  relays: ReadonlyArray<string>;
  branding?: RelayBranding;
  emojiSet?: RelayEmojiSet;
  roles?: RelayRoles;
  layout?: ChannelLayout;
  rootChannels?: ReadonlyArray<JsGroup>;
}) {
  return (
    <>
      {panel === 'branding' && branding && (
        <EditBrandingSheet
          relayUrl={relayUrl}
          branding={branding}
          close={close}
        />
      )}
      {panel === 'emojis' && emojiSet && (
        <RelayEmojiAdminModal
          relayUrl={relayUrl}
          emojiSet={emojiSet}
          configuredRelays={relays}
          onClose={close}
        />
      )}
      {panel === 'categories' && layout && (
        <ManageCategoriesSheet
          relayUrl={relayUrl}
          layout={layout}
          channels={rootChannels ?? []}
          close={close}
        />
      )}
      {panel === 'members' && (
        <RelayAdminPanel onClose={close} />
      )}
      {panel === 'roles' && roles && (
        <RelayRolesAdminModal
          relayUrl={relayUrl}
          roles={roles}
          onClose={close}
        />
      )}
    </>
  );
}
