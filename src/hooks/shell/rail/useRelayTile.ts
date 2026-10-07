'use client';

import { useState } from 'react';
import { useMyPubkey } from '@/services/nostr-bridge';
import { faviconFor } from '@/services/relay/relay-info';
import { useHasAnyHighlights } from '@/hooks/read-state/useChannelHighlights';
import { useUnreadMentionCount } from '@/hooks/notifications/useNotificationSelectors';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { useTranslations } from 'next-intl';
import { relayShareLink } from '@/utils/relay-url/relay-share-link';
import { useRelayInfo } from '@/hooks/shell/rail/useRelayInfo';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';

/** One relay tile's state: its icon, its unread markers, its context menu and share link. */
export function useRelayTile(url: string, active: boolean) {
  const t = useTranslations();
  const [menu, setMenu] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  // The shared copy flag (2000 ms; this tile used its own 1500 ms timer).
  const { copied, copy } = useCopyToClipboard();
  const myPubkey = useMyPubkey();
  // The bridge only has message data for the currently-active relay, so the
  // highlights signal is meaningful on the active tile only. Cross-relay
  // mention surveillance ships in a follow-up, see docs/read-state.md.
  const hasHighlights = useHasAnyHighlights(myPubkey);
  const activeCards = useUnreadMentionCount(active ? normalizeRelayUrl(url) : null);
  const showHighlight = active && (hasHighlights || activeCards > 0);
  // Relays you're not on: unread mentions/replies heard by the background
  // relay watch (`background-watch.ts`). The active relay's live in the bell.
  const backgroundUnread = useUnreadMentionCount(active ? null : normalizeRelayUrl(url));
  // No icon until NIP-11 has answered, then its icon or the favicon guess.
  const { info, loaded } = useRelayInfo(url);
  const iconUrl = loaded ? (info?.icon || faviconFor(url)) : null;

  async function copyShareLink() {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar';
    const link = relayShareLink(origin, url);
    // A refused clipboard falls back to a prompt the user can copy from.
    if (!(await copy(link))) window.prompt(t('shell.rail.copyPrompt'), link);
  }

  return {
    menu, setMenu,
    copied: copied !== null, copyShareLink,
    showHighlight, backgroundUnread,
    /** The icon to draw, or `null` for the letter tile. */
    icon: iconUrl && !iconFailed ? iconUrl : null,
    onIconError: () => setIconFailed(true),
  };
}
