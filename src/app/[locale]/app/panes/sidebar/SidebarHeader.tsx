'use client';

import type { RelayBranding } from '@/services/relay-branding';
import { shortHost } from '@/utils/relay-url/url-host';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import RemoteImage from '@/components/ui/RemoteImage';

type Props = {
  relay: string;
  conn: string;
  branding: RelayBranding;
  brandingLoaded: boolean;
  showTitleSkeleton: boolean;
  isRelayOperator: boolean;
  onOpenSettings: () => void;
};

/** The relay's banner, icon and name over the channel list, with the connection dot and the operator's gear. */
export function SidebarHeader({
  relay, conn, branding, brandingLoaded, showTitleSkeleton, isRelayOperator, onOpenSettings,
}: Props) {
  const t = useTranslations();
  return (
    <div
      className="group relative shrink-0 border-b border-transparent shadow-sm transition-colors hover:border-lc-border"
      data-testid="sidebar-header"
    >
      {/* Banner slot, always present so swapping in the real image
          doesn't shift layout. Three states:
            - branding not loaded yet: lc-banner-placeholder (transparent feel)
            - branding loaded + has banner URL: image fades in
            - branding loaded + no banner URL: nothing rendered (clean) */}
      {!brandingLoaded && (
        <div
          aria-hidden
          data-testid="sidebar-banner-placeholder"
          className="lc-banner-placeholder absolute inset-0 h-full w-full"
        />
      )}
      {brandingLoaded && branding.banner && (
        <RemoteImage
          src={branding.banner}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {brandingLoaded && branding.banner && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-lc-black/85 via-lc-black/40 to-transparent"
        />
      )}
      <div className="relative flex h-14 items-center gap-3 overflow-hidden px-4">
        {!brandingLoaded && (
          <div
            aria-hidden
            data-testid="sidebar-icon-skeleton"
            className="lc-skeleton h-9 w-9 shrink-0 rounded-lg border border-lc-border"
          />
        )}
        {brandingLoaded && branding.icon && (
          <RemoteImage
            src={branding.icon}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg border border-lc-border bg-lc-black object-cover"
          />
        )}
        <div className="min-w-0 flex-1 truncate text-base font-bold text-lc-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {showTitleSkeleton ? (
            <span
              aria-hidden
              data-testid="sidebar-title-skeleton"
              className="lc-skeleton inline-block h-4 w-32 align-middle"
            />
          ) : (
            branding.name || shortHost(relay)
          )}
        </div>
        <span
          title={conn}
          aria-label={conn}
          className={
            'inline-block h-2.5 w-2.5 shrink-0 rounded-full ' +
            (conn === 'Connected' ? 'bg-lc-green' : conn === 'Connecting' ? 'bg-yellow-500' : 'bg-red-500')
          }
        />
        {isRelayOperator && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            title={t('shell.desktop.server.settings')}
            aria-label={t('shell.desktop.server.settings')}
            className="shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09A1.65 1.65 0 0019.4 15z" />
            </svg>
          </Button>
        )}
      </div>
      {/* Banner-height spacer. Reserved while branding is still loading
          so the placeholder occupies the same vertical space the real
          banner would, no layout shift when the image arrives. After
          branding loads we only keep the spacer if there's an actual
          banner URL (kept-clean fallback for branding-without-banner). */}
      {(!brandingLoaded || (brandingLoaded && branding.banner)) && (
        <div aria-hidden className="relative h-24" />
      )}
    </div>
  );
}
