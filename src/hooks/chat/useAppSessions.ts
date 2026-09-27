'use client';

import { useEffect } from 'react';

import { useAppsStore, selectSummary } from '@/store/apps';
import { ingestSessionEvents } from '@/lib/apps/ingest';
import { subscribeChannelSessions } from '@/lib/apps/transport';
import type { SessionSummary } from '@/lib/apps/session';

/**
 * Keep the active channel's app sessions flowing into the store while the
 * channel is open. Same single-relay subscription games used
 * (`subscribeChannelSessions`: `#h` first, the relay-wide fallback only for a
 * relay proven not to index the tag).
 */
export function useChannelSessionsSubscription(channelId: string | null): void {
  useEffect(() => {
    if (!channelId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void subscribeChannelSessions(channelId, (ev) => ingestSessionEvents([ev])).then((fn) => {
      if (cancelled) { fn(); return; }
      unsub = fn;
    }).catch((err) => console.warn('[apps] subscription failed', err));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [channelId]);
}

/** One session's host-side summary, re-rendering only when that session's log changes. */
export function useSessionSummary(sessionId: string | null): SessionSummary | null {
  const log = useAppsStore((s) => (sessionId ? s.logs[sessionId] : undefined));
  return sessionId && log ? selectSummary({ logs: { [sessionId]: log } }, sessionId) : null;
}
