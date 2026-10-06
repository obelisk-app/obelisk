'use client';

import { useState } from 'react';
import { relayWebsiteUrl } from '@/utils/relay-url/normalize';
import RelayStatusPill from '@/components/social/RelayStatusPill';
import { openSettings } from '@/utils/open-settings';
import { usePreferences } from '@/hooks/usePreferences';
import type { DmNotification, MentionNotification } from '@/store/notifications';
import { shortHost } from '@/utils/relay-url/url-host';
import { useTranslation } from '@/i18n/context';
import { HelpPopover } from './topbar/HelpPopover';
import { InboxPopover } from './topbar/InboxPopover';
import { useDismissOnOutside, useInboxStreams } from '@/hooks/app/panes/topbar/useTopBarPopovers';
import { useRelayHeaderInfo } from '@/hooks/app/useRelayHeaderInfo';
import Button from '@/components/ui/Button';
import RemoteImage from '@/components/ui/RemoteImage';

export function RelayTopBar({
  relay,
  onOpenSidebar,
  onJumpToChannel,
  onJumpToDm,
  onSocialSurface = false,
}: {
  relay: string;
  onOpenSidebar?: () => void;
  onJumpToChannel?: (channelId: string) => void;
  onJumpToDm?: (peer: string) => void;
  /** True on the feed, the only surface that reads the social relay tier. */
  onSocialSurface?: boolean;
}) {
  const { t } = useTranslation();
  const socialRelays = usePreferences().socialRelays;
  const header = useRelayHeaderInfo(relay);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const inbox = useInboxStreams(relay);
  // Close either popover on outside click / Escape.
  useDismissOnOutside(notifOpen, setNotifOpen, 'data-notif-popover', 'data-notif-trigger');
  useDismissOnOutside(helpOpen, setHelpOpen, 'data-help-popover', 'data-help-trigger');

  // The two panels are mutually exclusive - opening one closes the other so
  // they can't overlap in the same top-right corner. Done in the two toggle
  // handlers (the only places either opens) rather than in effects.
  const toggleNotif = () => {
    setHelpOpen(false);
    setNotifOpen((v) => !v);
  };
  const toggleHelp = () => {
    setNotifOpen(false);
    setHelpOpen((v) => !v);
  };

  const handleMentionClick = (m: MentionNotification) => {
    onJumpToChannel?.(m.channelId);
    setNotifOpen(false);
  };
  const handleDmClick = (d: DmNotification) => {
    onJumpToDm?.(d.senderPubkey);
    setNotifOpen(false);
  };

  const displayName = header.name || shortHost(relay);
  const website = relayWebsiteUrl(relay);
  const unreadInboxCount = inbox.unreadInboxCount;
  return (
    <div
      className="h-14 md:h-10 shrink-0 px-3"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {onOpenSidebar && (
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={onOpenSidebar}
          aria-label={t('desktop.header.openMenu')}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-lg md:hidden"
        >
          <svg className="w-7 h-7 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Button>
      )}
      <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {/*
          Relay state belongs with the other header state, not in a settings
          panel you only open once you already suspect something. The popover
          answers both halves of "is anything wrong": this relay's connection
          and NIP-42 state, and whether the feed relays are up.
        */}
        <RelayStatusPill
          relays={socialRelays}
          activeRelay={relay}
          onOpenSettings={() => openSettings('relays')}
          indicate={onSocialSurface ? 'social' : 'active'}
        />
        <Button
          variant="ghost"
          size="icon-touch"
          data-notif-trigger
          onClick={toggleNotif}
          className="relative rounded-lg"
          title={t('common.notifications')}
          aria-label={t('common.notifications')}
        >
          <svg className="w-6 h-6 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {unreadInboxCount > 0 && (
            <span className="absolute top-0.5 right-0.5 md:top-0 md:right-0 min-w-[16px] h-[16px] md:min-w-[14px] md:h-[14px] px-1 rounded-full bg-lc-green text-lc-black text-[10px] md:text-[9px] font-bold flex items-center justify-center leading-none">
              {unreadInboxCount > 99 ? '99+' : unreadInboxCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-touch"
          data-help-trigger
          onClick={toggleHelp}
          className="rounded-lg"
          title={t('common.help')}
          aria-label={t('common.help')}
        >
          <svg className="w-6 h-6 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </Button>
      </div>
      {notifOpen && <InboxPopover inbox={inbox} onMentionClick={handleMentionClick} onDmClick={handleDmClick} />}
      {helpOpen && <HelpPopover onClose={() => setHelpOpen(false)} />}
      {/*
        The relay's own page, which is where "who runs this and what are its
        rules" actually lives. It was inert text, so the app never answered
        that from inside the app.
      */}
      <a
        href={website ?? undefined}
        {...(website ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={`flex items-center gap-2 min-w-0 max-w-[55%] rounded-lg px-1 py-0.5 ${
          website ? 'transition-colors hover:bg-lc-border/40' : 'pointer-events-none'
        }`}
        title={website ?? displayName}
        data-testid="relay-topbar-name"
      >
        {header.icon ? (
          <RemoteImage
            src={header.icon}
            alt=""
            onError={header.onIconError}
            className="w-7 h-7 md:w-5 md:h-5 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div className="w-7 h-7 md:w-5 md:h-5 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs md:text-[10px] font-bold shrink-0">
            {displayName[0]?.toUpperCase() || 'R'}
          </div>
        )}
        <span className="text-sm md:text-xs font-semibold text-lc-white truncate">{displayName}</span>
      </a>
    </div>
  );
}
