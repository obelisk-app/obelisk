'use client';

import { useState, type MouseEvent } from 'react';
import { useCurrentRelayUrl, useMyPubkey, type JsGroup } from '@/services/nostr-bridge';
import { wotColorClass } from '@/services/wot/colors';
import { useUnreadMentionCardsForChannel } from '@/hooks/notifications/useNotificationSelectors';
import { useCachedChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { isChannelMuted, useChannelPref } from '@/store/chat/channel-prefs';
import type { View } from '@/utils/shell/desktop/view';
import { knownGroups } from '@/utils/shell/panes/sidebar/channel-tree';
import { groupBadges, groupLabel, groupNodeIndent, wotDistanceTitle } from '@/utils/shell/panes/sidebar/group-node';
import { readForumCollapsed, writeForumCollapsed } from '@/services/shell/panes/sidebar/forum-collapsed';

/**
 * One desktop channel row's view model: whether it is the open channel, its
 * badges and markers, its right-click menu, and for a publication the fold
 * of its thread list.
 */
export function useGroupNode({ group, view, depth, childrenByParent, groupsById, distanceById }: {
  group: JsGroup;
  view: View;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Readonly<Record<string, JsGroup>>;
  distanceById?: Readonly<Record<string, number | null>>;
}) {
  const childIds = childrenByParent[group.id] ?? [];
  const active = view.kind === 'group' && view.groupId === group.id;
  const myPubkey = useMyPubkey();
  const highlights = useCachedChannelHighlights(group.id, myPubkey);
  const relay = useCurrentRelayUrl();
  const pref = useChannelPref(relay, group.id);
  const muted = isChannelMuted(pref);
  // Mention cards stay until the message has actually been on screen
  // (`useMentionSeen`), so they show even on the active row.
  const mentionCards = useUnreadMentionCardsForChannel(relay, group.id);
  // When the user is actively viewing the channel, the auto-mark hook is
  // about to advance the cursor: suppress the badges to avoid a brief count
  // flash (the favicon badge subtracts the same way, useFaviconBadge.ts).
  const badges = groupBadges({ active, unfollowed: !!pref.unfollowed, mentionCards, ...highlights });
  // Right-click: the channel menu (mark read, follow, mute, notify, copy link).
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  // Publications default to expanded so new threads are visible at once; the
  // fold is saved per publication. Other channels never fold: collapsing
  // arbitrary nesting isn't part of this UX.
  const isCollapsible = group.kind === 'forum' && childIds.length > 0;
  const [collapsed, setCollapsed] = useState(() => readForumCollapsed(group.id));

  return {
    active,
    relay,
    muted,
    /** Unfollowed or muted: drawn faded unless it is the open channel. */
    dimmed: (!!pref.unfollowed || muted) && !active,
    ...badges,
    label: groupLabel(group),
    indent: groupNodeIndent(depth),
    wotClass: distanceById ? wotColorClass(distanceById[group.id] ?? null) : '',
    wotTitle: wotDistanceTitle(distanceById?.[group.id]),
    isCollapsible,
    collapsed,
    toggleCollapsed: () => {
      setCollapsed(!collapsed);
      writeForumCollapsed(group.id, !collapsed);
    },
    /** The child channels this client knows (a publication's threads). */
    children: knownGroups(childIds, groupsById),
    menuAt,
    menuTarget: relay ? {
      relay,
      channelId: group.id,
      name: groupLabel(group),
      hasUnread: highlights.unread > 0 || mentionCards > 0,
    } : null,
    openMenu: (e: MouseEvent) => {
      if (!relay) return;
      e.preventDefault();
      setMenuAt({ x: e.clientX, y: e.clientY });
    },
    closeMenu: () => setMenuAt(null),
  };
}
