'use client';

import type { ChannelNotifyLevel } from '@/store/chat/channel-prefs';
import { useChannelActions, type ChannelActionsTarget } from './useChannelActions';
import { useMutedLabel } from './useMutedLabel';

/**
 * The channel menu's actions as the desktop menu and the phone sheet run
 * them: each one does its work, then closes the menu. Also the readings both
 * show (following, muted and when it ends, the notification level).
 */
export function useChannelMenuActions(target: ChannelActionsTarget, onClose: () => void) {
  const a = useChannelActions(target);
  const mutedLabel = useMutedLabel(a.muted ? a.pref.mutedUntil : undefined);
  const thenClose = (fn: () => void) => {
    fn();
    onClose();
  };
  return {
    following: a.following,
    muted: a.muted,
    level: a.level,
    mutedLabel,
    markRead: () => thenClose(a.markRead),
    toggleFollow: () => thenClose(a.toggleFollow),
    unmute: () => thenClose(a.unmute),
    copyLink: () => thenClose(() => void a.copyLink()),
    mute: (ms: number) => thenClose(() => a.mute(ms)),
    setLevel: (level: ChannelNotifyLevel) => thenClose(() => a.setLevel(level)),
  };
}

export type ChannelMenuActions = ReturnType<typeof useChannelMenuActions>;
