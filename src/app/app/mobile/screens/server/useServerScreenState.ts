'use client';

import { useCallback, useEffect, useState } from 'react';
import { faviconFor, fetchRelayInfo } from '@/services/relay-info';

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

/**
 * NIP-11 name + icon for the active relay header. Mirrors RelayTopBar on
 * desktop, both surfaces show the operator-set name (e.g. "Obelisk Public
 * Relay") and fall back to the URL host until the doc resolves.
 */
export function useActiveRelayInfo(relay: string | null | undefined) {
  const [activeRelayInfo, setActiveRelayInfo] = useState<{ name?: string; icon?: string } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Awaiting a decision, not a lint fix: the rule's fix (key the result on `relay`) stops showing the previous relay's name and icon while the new relay's NIP-11 document loads, which is a visible change. Options and recommendation in audits/obelisk/round9/FIX-lint-warnings.md.
    if (!relay) { setActiveRelayInfo(null); return; }
    let alive = true;
    fetchRelayInfo(relay).then((info) => {
      if (!alive) return;
      setActiveRelayInfo({ name: info?.name, icon: info?.icon || faviconFor(relay) || undefined });
    });
    return () => { alive = false; };
  }, [relay]);
  return activeRelayInfo;
}
