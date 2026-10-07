'use client';

import type { RelayBranding } from '@/services/relay/relay-branding';
import { shortHost } from '@/utils/relay-url/url-host';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { connectionLabel } from '@/utils/relay/relay-status';
import { GearIcon } from '@/assets/icons';

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
          title={connectionLabel(conn, t)}
          aria-label={connectionLabel(conn, t)}
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
            <GearIcon strokeWidth={2} strokeLinejoin="miter" />
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
