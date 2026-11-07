'use client';

import RelayDeckPicker from '@/components/relay/RelayDeckPicker';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import MobileRelayStatus from '@/components/relay/MobileRelayStatus';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMobileServerBanner } from '@/hooks/shell/mobile/rail/useMobileServerBanner';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import { MoreIcon, PlusIcon, SearchIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';

/**
 * The active relay's banner above the phone's channel list: its banner
 * image, icon and name, with the combined relay and signing
 * status and the search, create-channel and space-menu buttons.
 */
export function MobileServerBanner({
  label,
  relays = [],
  onSelectRelay,
  onAddRelay,
  relayUrl,
  iconUrl,
  bannerUrl,
  onSearch,
  onCreateChannel,
  onOpenMenu,
}: {
  label: string;
  relays?: readonly string[];
  onSelectRelay?: (url: string) => void;
  onAddRelay?: () => void;
  relayUrl: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  onSearch: () => void;
  onCreateChannel: () => void;
  onOpenMenu: () => void;
}) {
  const t = useTranslations();
  const vm = useMobileServerBanner(relayUrl);
  return (
    <header className="server-banner" data-testid="mobile-server-banner">
      {bannerUrl ? (
        <RemoteImage className="server-banner-img" src={bannerUrl} alt="" aria-hidden="true" />
      ) : (
        <div className="server-banner-fallback" aria-hidden="true" />
      )}
      <div className="server-banner-shade" aria-hidden="true" />
      <div className="server-banner-actions">
        <MobileRelayStatus relays={vm.socialRelays} activeRelay={relayUrl} onOpenSettings={vm.openRelaySettings} />
        <Button variant="mobileIcon" className="action-search" aria-label={t('mobile.header.search')} onClick={onSearch}>
          <SearchIcon size={20} strokeWidth={1.5} />
        </Button>
        <Button
          variant="mobileIcon"
          className="action-create"
          aria-label={t('mobile.header.createChannel')}
          data-testid="mobile-create-channel-btn"
          onClick={onCreateChannel}
        >
          <PlusIcon size={20} />
        </Button>
        <Button variant="mobileIcon" className="action-menu" aria-label={t('mobile.header.spaceMenu')} onClick={onOpenMenu}>
          <MoreIcon size={20} strokeWidth={1.5} />
        </Button>
      </div>
      <div className="server-banner-meta">
        <div className="server-banner-icon" style={iconUrl ? undefined : avatarStyle(relayUrl || label)}>
          {iconUrl ? (
            <RemoteImage src={iconUrl} alt="" />
          ) : (
            vm.iconFallback
          )}
        </div>
        <div className="server-banner-copy">
          <Heading as="h2">
            <RelayDeckPicker relays={relays} activeRelay={relayUrl} onSelect={(url) => onSelectRelay?.(url)} onAdd={onAddRelay}>
              {label}
            </RelayDeckPicker>
          </Heading>

        </div>
      </div>
    </header>
  );
}
