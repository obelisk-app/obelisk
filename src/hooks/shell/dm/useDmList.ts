'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDirectMessages, useMyFollows } from '@/services/nostr-bridge';
import { ensureSocialProfiles } from '@/services/social/profiles';
import {
  defaultDmListTab,
  dmPeers,
  splitByFollows,
  type DmListTab,
} from '@/utils/shell/desktop/dm-list';
import { DM_LIST_TABS } from '@/constants/shell/desktop';

/**
 * The desktop DM list's view model: every conversation split into Follows
 * and Others, the tab shown, and the inline "new message" search.
 */
export function useDmList(onPick: (peer: string) => void) {
  const t = useTranslations();
  const dms = useDirectMessages();
  const follows = useMyFollows();
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<DmListTab | null>(null);

  const peers = useMemo(() => dmPeers(dms), [dms]);
  const split = useMemo(() => splitByFollows(peers, new Set(follows)), [peers, follows]);

  // Resolve every peer in one batched REQ instead of letting each row fire
  // its own: a list of thirty conversations is thirty round trips
  // otherwise. `ensureSocialProfiles` already filters to what's missing.
  const peerKey = peers.map((p) => p.pubkey).join(',');
  useEffect(() => {
    if (peers.length > 0) void ensureSocialProfiles(peers.map((p) => p.pubkey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey]);

  const activeTab = tab ?? defaultDmListTab(split.follows.length, split.others.length);

  return {
    composing,
    toggleComposing: () => setComposing((v) => !v),
    startComposing: () => setComposing(true),
    closeComposer: () => setComposing(false),
    /** A person picked in the search: close it and open their thread. */
    pickFromComposer: (pubkey: string) => {
      setComposing(false);
      onPick(pubkey);
    },
    /** The cache is not cleared from here; say where opened DMs live. */
    explainCache: () => alert(t('dm.clearCacheAlert')),
    activeTab,
    setTab,
    tabs: DM_LIST_TABS.map((id) => ({ id, count: split[id].length, active: activeTab === id })),
    hasConversations: peers.length > 0,
    visible: split[activeTab],
  };
}
