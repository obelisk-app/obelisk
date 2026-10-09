import { useEffect, useMemo, useRef, useState } from 'react';
import { useDirectMessages } from '@/services/nostr-bridge';
import { ensureSocialProfiles } from '@/services/social/profiles';
import { useKnownDmConversations } from '@/hooks/chat/dm/lists/useKnownDmConversations';
import { dmPeers } from '@/utils/shell/desktop/dm-list';
import { useScreenScrollMemo } from '@/hooks/shell/mobile/carousel/useScreenScrollMemo';
import { splitByFollows } from '@/utils/shell/mobile/dm-list';

/**
 * The phone DM list: conversations newest first, split into people you
 * follow and everyone else, with the tab's scroll position remembered. Each
 * row reads its own unread count from the persisted read-state cursor.
 */
export function useDmsListScreen(myFollows: ReadonlyArray<string>) {
  const dms = useDirectMessages();
  const [tab, setTab] = useState<'follows' | 'others'>('follows');
  const known = useKnownDmConversations();
  const peers = useMemo(() => dmPeers(dms, known).map((p) => ({ peer: p.pubkey, latest: p.last, latestAt: p.sortKey })), [dms, known]);

  // One batched kind-0 REQ for the whole list rather than one per row.
  const peerKey = peers.map((p) => p.peer).join(',');
  useEffect(() => {
    if (peers.length > 0) void ensureSocialProfiles(peers.map((p) => p.peer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey]);

  const followsSet = useMemo(() => new Set(myFollows), [myFollows]);
  const split = splitByFollows(peers, followsSet);
  const listRef = useRef<HTMLDivElement>(null);
  useScreenScrollMemo(`dms-list:${tab}`, listRef);

  return {
    tab,
    setTab,
    shown: tab === 'follows' ? split.follows : split.others,
    followsCount: split.follows.length,
    othersCount: split.others.length,
    listRef,
  };
}
