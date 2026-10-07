'use client';

/**
 * Everything the channel menu can do to one channel: mark read, follow,
 * mute, notification level, copy link. State lives in
 * `src/store/chat/channel-prefs.ts`; the bridge's `deliverGroupPing` honours it.
 */

import {
  isChannelMuted,
  notifyLevel,
  useChannelPref,
  useChannelPrefsStore,
  type ChannelNotifyLevel,
} from '@/store/chat/channel-prefs';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';
import { channelLink } from '@/utils/chat/channel/channel-link';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';

export interface ChannelActionsTarget {
  readonly relay: string;
  readonly channelId: string;
}

export function useChannelActions(target: ChannelActionsTarget) {
  const { relay, channelId } = target;
  const pref = useChannelPref(relay, channelId);
  const store = useChannelPrefsStore.getState;
  // The shared clipboard hook: a refused write leaves `copied` false, and a
  // success clears itself after the hook's default 2000 ms.
  const { copied, copy } = useCopyToClipboard();
  return {
    pref,
    muted: isChannelMuted(pref),
    level: notifyLevel(pref),
    following: !pref.unfollowed,
    copied: copied !== null,
    markRead: () => {
      useReadStateStore.getState().setGroupCursor(channelId, Date.now());
      useNotificationsStore.getState().markChannelMentionsSeen(relay, channelId);
    },
    toggleFollow: () => store().setFollowing(relay, channelId, !!pref.unfollowed),
    mute: (ms: number) => store().setMutedUntil(relay, channelId, ms === MUTED_FOREVER ? MUTED_FOREVER : Date.now() + ms),
    unmute: () => store().setMutedUntil(relay, channelId, null),
    setLevel: (level: ChannelNotifyLevel) => store().setNotify(relay, channelId, level),
    copyLink: async () => {
      await copy(channelLink(relay, channelId));
    },
  };
}
