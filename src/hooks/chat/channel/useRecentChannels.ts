'use client';

import { useEffect, useState } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import { channelPrefKey, useChannelPrefsStore } from '@/store/chat/channel-prefs';

import { RECENT_CHANNEL_WINDOW_SECONDS } from '@/constants/chat/channel-prefs';

const WINDOW_MS = RECENT_CHANNEL_WINDOW_SECONDS * 1000;
const MAX_CHANNELS = 5;

export function useRecentChannels(relay: string | null, groups: readonly JsGroup[], childrenByParent: Readonly<Record<string, readonly string[]>>) {
  const prefs = useChannelPrefsStore((state) => state.prefs);
  const [now, setNow] = useState(Date.now);
  const children = new Set(Object.values(childrenByParent).flat());
  const ranked = relay ? groups.flatMap(({ id }) => {
    if (!children.has(id)) return [];
    const pref = prefs[channelPrefKey(relay, id)];
    const at = (pref?.latestMessageAt ?? 0) * 1000;
    return pref?.followed && !pref.unfollowed && at > 0 ? [{ id, at }] : [];
  }) : [];
  ranked.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const recent = ranked.filter(({ at }) => at + WINDOW_MS > now).slice(0, MAX_CHANNELS);
  const nextExpiry = recent.at(-1)?.at;
  useEffect(() => {
    if (nextExpiry === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry + WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [nextExpiry]);
  return new Set((recent.length ? recent : ranked.slice(0, MAX_CHANNELS)).map(({ id }) => id));
}
