'use client';

import { useState } from 'react';
import { relayWebsiteUrl } from '@/utils/relay-url/normalize';
import { shortHost } from '@/utils/relay-url/url-host';
import { openSettings } from '@/utils/settings/open-settings';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useRelayHeaderInfo } from '@/hooks/relay/info/useRelayHeaderInfo';
import type { DmNotification, MentionNotification } from '@/store/notifications';
import { useDismissOnOutside, useInboxStreams } from '@/hooks/shell/panes/topbar/useTopBarPopovers';

/**
 * The desktop top bar's view model: the relay's name and website, the bell
 * and help panels (mutually exclusive, closed on an outside click or
 * Escape), and where a click on a notification goes.
 */
export function useRelayTopBar({ relay, onJumpToChannel, onJumpToDm }: {
  relay: string;
  onJumpToChannel?: (channelId: string) => void;
  onJumpToDm?: (peer: string | null) => void;
}) {
  const socialRelays = usePreferences().socialRelays;
  const header = useRelayHeaderInfo(relay);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const inbox = useInboxStreams(relay);
  // Close either popover on outside click / Escape.
  useDismissOnOutside(notifOpen, setNotifOpen, 'data-notif-popover', 'data-notif-trigger');
  useDismissOnOutside(helpOpen, setHelpOpen, 'data-help-popover', 'data-help-trigger');

  const displayName = header.name || shortHost(relay);
  return {
    socialRelays,
    header,
    inbox,
    notifOpen,
    helpOpen,
    displayName,
    website: relayWebsiteUrl(relay),
    // The two panels are mutually exclusive: opening one closes the other so
    // they can't overlap in the same top-right corner. Done in the two
    // toggles (the only places either opens) rather than in effects.
    toggleNotif: () => { setHelpOpen(false); setNotifOpen((v) => !v); },
    toggleHelp: () => { setNotifOpen(false); setHelpOpen((v) => !v); },
    closeHelp: () => setHelpOpen(false),
    openRelaySettings: () => openSettings('relays'),
    onMentionClick: (m: MentionNotification) => { onJumpToChannel?.(m.channelId); setNotifOpen(false); },
    onDmClick: (d: DmNotification) => { onJumpToDm?.(d.senderPubkey); setNotifOpen(false); },
    /** The locked DMs row: open the DM list, which unlocks them. */
    onOpenDms: () => { onJumpToDm?.(null); setNotifOpen(false); },
  };
}
