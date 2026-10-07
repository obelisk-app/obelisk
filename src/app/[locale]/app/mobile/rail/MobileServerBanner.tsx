'use client';

import { useTranslations } from 'next-intl';
import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import RelayStatusPill from '@/components/relay/RelayStatusPill';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMobileServerBanner } from '@/hooks/shell/mobile/rail/useMobileServerBanner';
import { avatarStyle } from '../common/avatar';

/**
 * The active relay's banner above the phone's channel list: its banner
 * image, icon, name and host, with the relay status pill, the signing
 * indicator and the search, create-channel and space-menu buttons.
 */
export function MobileServerBanner({
  label,
  relayUrl,
  iconUrl,
  bannerUrl,
  onSearch,
  onCreateChannel,
  onOpenMenu,
}: {
  label: string;
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
        {/* Beside the signing indicator, because it answers the same kind of
            question: is the thing underneath this app working right now. */}
        {/* `active`: this banner only ever sits above the server/channel
            surface, which reads the NIP-29 relay and never the social tier.
            Reporting the social count here showed a red 0/4 over a working
            chat. The popover still answers both. */}
        <RelayStatusPill
          relays={vm.socialRelays}
          activeRelay={relayUrl}
          onOpenSettings={vm.openRelaySettings}
          indicate="active"
          compact
        />
        <MobileSigningIndicator />
        <button className="icon-btn action-search" aria-label={t('mobile.header.search')} onClick={onSearch}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
        <button
          className="icon-btn action-create"
          aria-label={t('mobile.header.createChannel')}
          data-testid="mobile-create-channel-btn"
          onClick={onCreateChannel}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="icon-btn action-menu" aria-label={t('mobile.header.spaceMenu')} onClick={onOpenMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
        </button>
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
          <h2>{label}</h2>
          {/* The host is the relay's own page - its rules and operator. */}
          {vm.host && (vm.website ? (
            <a href={vm.website} target="_blank" rel="noopener noreferrer" data-testid="mobile-relay-website">
              {vm.host}
            </a>
          ) : (
            <span>{vm.host}</span>
          ))}
        </div>
      </div>
    </header>
  );
}
