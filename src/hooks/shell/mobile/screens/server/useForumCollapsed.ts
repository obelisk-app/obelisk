'use client';

import { useCallback, useState } from 'react';

const FORUM_COLLAPSED_PREFIX = 'obelisk-dex/forum-collapsed/';

/**
 * Which publications have their thread list collapsed. Mirrors desktop's
 * per-forum flag in localStorage so toggles survive reloads and stay in sync
 * across surfaces (key: `obelisk-dex/forum-collapsed/<id>` = '1' means
 * collapsed; missing = expanded).
 */
export function useForumCollapsed() {
  const [forumCollapsed, setForumCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    const out: Record<string, boolean> = {};
    try {
      const prefix = FORUM_COLLAPSED_PREFIX;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        if (window.localStorage.getItem(key) === '1') out[key.slice(prefix.length)] = true;
      }
    } catch {}
    return out;
  });
  const toggleForumCollapsed = useCallback((id: string) => {
    setForumCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== 'undefined') {
        const key = `${FORUM_COLLAPSED_PREFIX}${id}`;
        if (next[id]) window.localStorage.setItem(key, '1');
        else window.localStorage.removeItem(key);
      }
      return next;
    });
  }, []);
  return { forumCollapsed, toggleForumCollapsed };
}
