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
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>}
          rowLabel={t('mobile.space.invite')}
          hint={vm.busy === 'invite' ? '…' : t('mobile.space.copyLinkHint')}
          onClick={vm.invite}
        />
        <RelayMenuRow
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>}
          rowLabel={t('mobile.space.share')}
          hint={vm.busy === 'share' ? '…' : undefined}
          onClick={vm.share}
        />
        <RelayMenuRow
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
          rowLabel={t('mobile.space.copyUrl')}
          onClick={vm.copyUrl}
        />
        {isAdmin && <RelayMenuAdminRows onOpen={vm.openPanel} />}
        <RelayMenuRow
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>}
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
