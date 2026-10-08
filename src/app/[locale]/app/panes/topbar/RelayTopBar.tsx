'use client';

import Text from '@/components/ui/layout/Text';
import Link from '@/components/ui/navigation/Link';
import RelayStatusPill from '@/components/relay/RelayStatusPill';
import { useTranslations } from 'next-intl';
import { HelpPopover } from './HelpPopover';
import { InboxPopover } from './InboxPopover';
import { useRelayTopBar } from '@/hooks/shell/panes/topbar/useRelayTopBar';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { BellIcon, HelpCircleIcon } from '@/assets/icons';

/**
 * The desktop top bar: the relay's name and icon (a link to its website),
 * the relay status pill, the bell and the help button. State and handlers
 * come from `useRelayTopBar`.
 */
export function RelayTopBar({
  relay,
  onJumpToChannel,
  onJumpToDm,
  onSocialSurface = false,
}: {
  relay: string;
  onJumpToChannel?: (channelId: string) => void;
  /** Open the DMs on `peer`'s thread, or on the list (`null`). */
  onJumpToDm?: (peer: string | null) => void;
  /** True on the feed, the only surface that reads the social relay tier. */
  onSocialSurface?: boolean;
}) {
  const t = useTranslations();
  const vm = useRelayTopBar({ relay, onJumpToChannel, onJumpToDm });
  const identity = (
    <>
      {vm.header.icon ? (
        <RemoteImage
          src={vm.header.icon}
          alt=""
          onError={vm.header.onIconError}
          className="w-7 h-7 md:w-5 md:h-5 rounded-full shrink-0 object-cover"
        />
      ) : (
        <div className="w-7 h-7 md:w-5 md:h-5 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs md:text-[10px] font-bold shrink-0">
          {vm.displayName[0]?.toUpperCase() || 'R'}
        </div>
      )}
      <Text size="sm" tone="default" weight="semibold" className="md:text-xs truncate">{vm.displayName}</Text>
    </>
  );
  const identityClass = 'flex items-center gap-2 min-w-0 max-w-[55%] rounded-lg px-1 py-0.5';
  return (
    <div
      className="h-14 md:h-10 shrink-0 px-3"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {/*
          Relay state belongs with the other header state, not in a settings
          panel you only open once you already suspect something. The popover
          answers both halves of "is anything wrong": this relay's connection
          and NIP-42 state, and whether the feed relays are up.
        */}
        <RelayStatusPill
          relays={vm.socialRelays}
          activeRelay={relay}
          onOpenSettings={vm.openRelaySettings}
          indicate={onSocialSurface ? 'social' : 'active'}
        />
        <Button
          variant="ghost"
          size="icon-touch"
          data-notif-trigger
          onClick={vm.toggleNotif}
          className="relative"
          title={t('common.notifications')}
          aria-label={t('common.notifications')}
        >
          <BellIcon size={null} strokeWidth={1.5} className="w-6 h-6 md:w-4 md:h-4" />
          {vm.inbox.unreadInboxCount > 0 && (
            <span className="absolute top-0.5 right-0.5 md:top-0 md:right-0 min-w-[16px] h-[16px] md:min-w-[14px] md:h-[14px] px-1 rounded-full bg-lc-green text-lc-black text-[10px] md:text-[9px] font-bold flex items-center justify-center leading-none">
              {vm.inbox.unreadInboxCount > 99 ? '99+' : vm.inbox.unreadInboxCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-touch"
          data-help-trigger
          onClick={vm.toggleHelp}
          title={t('common.help')}
          aria-label={t('common.help')}
        >
          <HelpCircleIcon size={null} strokeWidth={2} className="w-6 h-6 md:w-4 md:h-4" />
        </Button>
      </div>
      {vm.notifOpen && <InboxPopover inbox={vm.inbox} onMentionClick={vm.onMentionClick} onDmClick={vm.onDmClick} onOpenDms={vm.onOpenDms} />}
      {vm.helpOpen && <HelpPopover onClose={vm.closeHelp} />}
      {/*
        The relay's own page, which is where "who runs this and what are its
        rules" actually lives. It was inert text, so the app never answered
        that from inside the app.
      */}
      {vm.website ? (
        <Link href={vm.website} target="_blank" className={`${identityClass} hover:bg-lc-border/40`}
          title={vm.website} data-testid="relay-topbar-name">
          {identity}
        </Link>
      ) : (
        <div className={identityClass} title={vm.displayName} data-testid="relay-topbar-name">
          {identity}
        </div>
      )}
    </div>
  );
}
