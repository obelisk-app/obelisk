'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { type JsGroup } from '@/services/nostr-bridge';
import { type ChannelLayout } from '@/services/relay/channel-layout';
import { type RelayBranding } from '@/services/relay/relay-branding';
import { type RelayEmojiSet } from '@/services/relay/relay-emojis';
import { type RelayRoles } from '@/services/relay/relay-roles';
import { useTranslations } from 'next-intl';
import { useRelayMenuSheet } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { RelayMenuRow } from './RelayMenuRow';
import { RelayMenuAdminRows } from './RelayMenuAdminRows';
import { RelayMenuPanels } from './RelayMenuPanels';
import { CopyIcon, LogOutIcon, ShareIcon, UserPlusIcon } from '@/assets/icons';

/**
 * The phone relay menu: invite, share, copy the URL and leave, plus the
 * operator's panels. Actions are `useRelayMenuSheet`; the rows, the admin
 * section and the stacked panels are their own components.
 */
export function RelayMenuSheet({
  close,
  relayUrl,
  label,
  iconUrl,
  isAdmin = false,
  branding,
  emojiSet,
  roles,
  layout,
  rootChannels,
}: {
  close: () => void;
  relayUrl: string;
  label: string;
  iconUrl?: string | null;
  isAdmin?: boolean;
  branding?: RelayBranding;
  emojiSet?: RelayEmojiSet;
  roles?: RelayRoles;
  layout?: ChannelLayout;
  rootChannels?: ReadonlyArray<JsGroup>;
}) {
  const t = useTranslations();
  const vm = useRelayMenuSheet({ relayUrl, label, close });

  return (
    <Sheet onClose={close} screen="relay-menu" label={label} maxHeight="88%" stacked={(
      <RelayMenuPanels
        panel={vm.adminPanel}
        close={vm.closePanel}
        relayUrl={relayUrl}
        relays={vm.relays}
        branding={branding}
        emojiSet={emojiSet}
        roles={roles}
        layout={layout}
        rootChannels={rootChannels}
      />
    )}>
      <SheetHeader
        variant="identity"
        media={
          <div className="space-icon" style={{ width: 44, height: 44, ...(iconUrl ? {} : avatarStyle(relayUrl)) }}>
            {iconUrl ? <RemoteImage src={iconUrl} alt="" /> : shortHost(relayUrl).slice(0, 1).toUpperCase()}
          </div>
        }
        title={label}
        subtitle={shortHost(relayUrl)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <RelayMenuRow
          icon={<UserPlusIcon size={20} strokeWidth={1.5} />}
          rowLabel={t('mobile.space.invite')}
          hint={vm.busy === 'invite' ? '…' : t('mobile.space.copyLinkHint')}
          onClick={vm.invite}
        />
        <RelayMenuRow
          icon={<ShareIcon size={20} strokeWidth={1.5} />}
          rowLabel={t('mobile.space.share')}
          hint={vm.busy === 'share' ? '…' : undefined}
          onClick={vm.share}
        />
        <RelayMenuRow
          icon={<CopyIcon size={20} strokeWidth={1.5} />}
          rowLabel={t('mobile.space.copyUrl')}
          onClick={vm.copyUrl}
        />
        {isAdmin && <RelayMenuAdminRows onOpen={vm.openPanel} />}
        <RelayMenuRow
          icon={<LogOutIcon size={20} strokeWidth={1.5} />}
          rowLabel={t('mobile.space.leave')}
          hint={vm.busy === 'leave' ? '…' : undefined}
          danger
          onClick={vm.leave}
        />
      </div>
      {vm.toast && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent, #b4f953)', textAlign: 'center' }}>{vm.toast}</div>
      )}
      <SheetActions onCancel={close} dismiss="close" cancelClassName="relay-menu-close" />
    </Sheet>
  );
}
