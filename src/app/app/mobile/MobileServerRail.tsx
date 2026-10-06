'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { useEffect, useRef, useState } from 'react';
import { faviconFor, fetchRelayInfo } from '@/services/relay-info';
import { useRelayBranding } from '@/services/relay-branding';
import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslation } from '@/i18n/context';
import { useUnreadMentionCount } from '@/services/notifications/selectors';
import { usePreferences } from '@/services/preferences';
import { normalizeRelayUrl, relayWebsiteUrl } from '@/services/nostr-bridge/relay-url';
import RelayStatusPill from '@/components/social/RelayStatusPill';
import { openSettings } from '@/utils/open-settings';
import { avatarStyle } from './avatar';
import RemoteImage from '@/components/ui/RemoteImage';

// Relay tile in the spaces strip - fetches NIP-11 icon, falls back to favicon,
// then to a letter on a gradient. Same pattern the desktop ServerRail uses.
export function RelayTile({
  url,
  active,
  onClick,
  onLongPress,
}: {
  url: string;
  active: boolean;
  onClick: () => void;
  onLongPress?: (info: { url: string; label: string; iconUrl: string | null }) => void;
}) {
  const { t } = useTranslation();
  const [iconFailed, setIconFailed] = useState(false);
  const [nip11Name, setNip11Name] = useState<string>('');
  const [operator, setOperator] = useState<string | null>(null);

  // Tile icon is the domain favicon - not NIP-11 metadata, not kind-30078
  // branding. The relay's metadata is used only for the name + operator pubkey.
  const iconUrl = faviconFor(url);

  useEffect(() => {
    let alive = true;
    fetchRelayInfo(url).then((info) => {
      if (!alive) return;
      if (info?.name) setNip11Name(info.name);
      if (info?.pubkey) setOperator(info.pubkey);
    });
    return () => { alive = false; };
  }, [url]);

  // Operator-published kind-30078 branding only contributes the NAME - the
  // tile icon stays as the relay's own NIP-11 `icon` (favicon fallback). The
  // branding image is the desktop banner, not a circular space-icon.
  const branding = useRelayBranding(url, operator ? [operator] : []);
  const label = branding.name || nip11Name || shortHost(url);
  const showImage = iconUrl && !iconFailed;
  // Only meaningful for relays you're NOT on: the active relay's pings are
  // in the bell. Fed by the background relay watch.
  const backgroundUnread = useUnreadMentionCount(active ? null : normalizeRelayUrl(url));

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const fireLongPress = () => {
    pressFired.current = true;
    onLongPress?.({ url, label, iconUrl: showImage ? iconUrl : null });
  };
  const startPress = () => {
    if (!onLongPress) return;
    pressFired.current = false;
    pressTimer.current = setTimeout(fireLongPress, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <button
      className={`space ${active ? 'active' : ''}`}
      onClick={() => {
        if (pressFired.current) { pressFired.current = false; return; }
        onClick();
      }}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={onLongPress ? (e) => { e.preventDefault(); fireLongPress(); } : undefined}
    >
      <div className="space-icon" style={!showImage ? avatarStyle(url) : undefined}>
        {showImage ? (
          <RemoteImage src={iconUrl} alt="" onError={() => setIconFailed(true)} />
        ) : (
          label.slice(0, 1).toUpperCase()
        )}
      </div>
      {backgroundUnread > 0 && (
        <span
          className="space-badge"
          aria-label={t('rail.backgroundUnread').replace('{count}', String(backgroundUnread))}
          data-testid="relay-background-unread"
        >
          {backgroundUnread > 99 ? '99+' : backgroundUnread}
        </span>
      )}
      <span className="space-name">{label}</span>
    </button>
  );
}

export function MobileServerRail({
  relays,
  activeRelay,
  onSelectRelay,
  onAddRelay,
  onLongPress,
}: {
  relays: ReadonlyArray<string>;
  activeRelay: string | null;
  onSelectRelay: (url: string) => void;
  onAddRelay: () => void;
  onLongPress?: (info: { url: string; label: string; iconUrl: string | null }) => void;
}) {
  const { t } = useTranslation();
  const activeKey = normalizeRelayUrl(activeRelay ?? '');
  return (
    <aside className="spaces-rail" data-testid="mobile-server-rail" aria-label={t('mobile.nav.servers')}>
      <div className="spaces-rail-scroll native-scroll-y" data-no-swipe>
        {relays.map((url) => {
          const isActive = normalizeRelayUrl(url) === activeKey;
          return (
            <RelayTile
              key={url}
              url={url}
              active={isActive}
              onClick={() => onSelectRelay(url)}
              onLongPress={onLongPress}
            />
          );
        })}
        <button className="space space-add" onClick={onAddRelay} aria-label={t('mobile.rail.addRelay')}>
          <div className="space-icon s-add">+</div>
          <span className="space-name">&nbsp;</span>
        </button>
      </div>
    </aside>
  );
}

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
  const { t } = useTranslation();
  const host = relayUrl ? shortHost(relayUrl) : '';
  const iconFallback = relayUrl ? shortHost(relayUrl).slice(0, 1).toUpperCase() : 'O';
  const website = relayUrl ? relayWebsiteUrl(relayUrl) : null;
  const socialRelays = usePreferences().socialRelays;
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
          relays={socialRelays}
          activeRelay={relayUrl}
          onOpenSettings={() => openSettings('relays')}
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
            iconFallback
          )}
        </div>
        <div className="server-banner-copy">
          <h2>{label}</h2>
          {/* The host is the relay's own page - its rules and operator. */}
          {host && (website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" data-testid="mobile-relay-website">
              {host}
            </a>
          ) : (
            <span>{host}</span>
          ))}
        </div>
      </div>
    </header>
  );
}
