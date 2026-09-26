'use client';

/**
 * Mark a mention card read only once the user has actually SEEN the message.
 *
 * The channel read cursor is the wrong signal for this: opening a channel
 * lands you at the bottom, the cursor jumps to the newest message, and a
 * mention twenty messages up counts as "read" without ever being on screen.
 * So a mention card carries its own `seen` flag, and this hook is the only
 * thing that sets it (besides the bell's explicit "mark read").
 *
 * "Seen" means: the message row (`[data-msg-id]`, rendered by both shells)
 * is at least {@link MENTION_SEEN_THRESHOLD} visible — or, for a message
 * taller than the viewport (image, long post), fills at least
 * {@link MENTION_SEEN_VIEWPORT_SHARE} of it — continuously for
 * {@link MENTION_SEEN_DWELL_MS}, while the tab is visible and focused.
 * IntersectionObserver accounts for clipping by the scroll container. A row
 * scrolled past in a flick, or on screen in a background tab, doesn't count.
 *
 * A card whose message doesn't exist in the channel (deleted, moderated,
 * never delivered) can never be seen; once the user has been watching the
 * channel at the bottom for {@link MENTION_MISSING_DWELL_MS} and the card
 * falls inside the loaded window, it's cleared — otherwise it would pin the
 * channel's `@` forever.
 *
 * Mounted once in `ReadStateRoot`; watches only the unseen mentions of the
 * channel currently open on the active relay.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useCurrentRelayUrl, useMessages } from '@/lib/nostr-bridge';
import { isUserWatchingChannel } from '@/lib/read-gates';
import { useChatStore } from '@/store/chat';
import { useNotificationsStore } from '@/store/notifications';
import { useMentionNotifications } from '@/lib/notifications/selectors';

export const MENTION_SEEN_THRESHOLD = 0.6;
/** A row taller than the viewport counts once it covers this share of it. */
export const MENTION_SEEN_VIEWPORT_SHARE = 0.4;
export const MENTION_SEEN_DWELL_MS = 1000;
export const MENTION_MISSING_DWELL_MS = 2000;
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);
const TICK_MS = 250;
const HEX_ID = /^[0-9a-f]{64}$/i;

function pageActive(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  return typeof document.hasFocus !== 'function' || document.hasFocus();
}

export function useMentionSeen(): void {
  const relay = useCurrentRelayUrl();
  const activeChannel = useChatStore((s) => s.activeChannelId);
  const mentions = useMentionNotifications(relay);
  // Loaded messages of the open channel — to tell "not rendered yet" from
  // "doesn't exist". Read through a ref so a new message doesn't restart
  // the observer.
  const messages = useMessages(activeChannel ?? null);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const pendingKey = useMemo(
    () => mentions
      .filter((m) => !m.seen && m.channelId === activeChannel && HEX_ID.test(m.id))
      .map((m) => m.id)
      .join(','),
    [mentions, activeChannel],
  );

  useEffect(() => {
    if (!relay || !activeChannel || !pendingKey) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const pending = new Set(pendingKey.split(','));
    const createdAtById = new Map(
      mentions.filter((m) => pending.has(m.id)).map((m) => [m.id, m.createdAt]),
    );
    const missingDwell = new Map<string, number>();
    const elements = new Map<string, Element>();
    const intersecting = new Set<string>();
    const dwell = new Map<string, number>();

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset?.msgId;
        if (!id) continue;
        const viewport = entry.rootBounds?.height
          ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
        const coversViewport = viewport > 0
          && entry.intersectionRect.height >= viewport * MENTION_SEEN_VIEWPORT_SHARE;
        if (entry.isIntersecting && (entry.intersectionRatio >= MENTION_SEEN_THRESHOLD || coversViewport)) {
          intersecting.add(id);
        } else {
          intersecting.delete(id);
        }
      }
    }, { threshold: THRESHOLDS });

    // Rows mount after messages load and can re-mount; re-resolve every tick.
    const attach = () => {
      for (const id of pending) {
        const el = document.querySelector(`[data-msg-id="${id}"]`);
        const prev = elements.get(id);
        if (el === prev) continue;
        if (prev) io.unobserve(prev);
        intersecting.delete(id);
        dwell.delete(id);
        if (el) {
          elements.set(id, el);
          io.observe(el);
        } else {
          elements.delete(id);
        }
      }
    };

    const markSeen = (id: string) => {
      pending.delete(id);
      const el = elements.get(id);
      if (el) io.unobserve(el);
      useNotificationsStore.getState().markMentionSeen(relay, id);
    };

    const tick = () => {
      attach();
      const active = pageActive();
      const watching = isUserWatchingChannel(activeChannel);
      const loaded = messagesRef.current ?? [];
      const oldestMs = loaded.length > 0 ? loaded[0].createdAt * 1000 : Infinity;
      for (const id of Array.from(pending)) {
        // Nothing on screen for it, and nothing that could be: the channel is
        // loaded past its timestamp and the message isn't there.
        const absent = !elements.has(id)
          && (createdAtById.get(id) ?? 0) >= oldestMs
          && !loaded.some((m) => m.id === id);
        if (absent && watching) {
          const total = (missingDwell.get(id) ?? 0) + TICK_MS;
          if (total >= MENTION_MISSING_DWELL_MS) {
            markSeen(id);
            continue;
          }
          missingDwell.set(id, total);
        } else {
          missingDwell.delete(id);
        }
        if (!active || !intersecting.has(id)) {
          dwell.delete(id);
          continue;
        }
        const total = (dwell.get(id) ?? 0) + TICK_MS;
        if (total >= MENTION_SEEN_DWELL_MS) markSeen(id);
        else dwell.set(id, total);
      }
    };

    attach();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      io.disconnect();
    };
    // `mentions` is read only for the pending cards' timestamps, which are
    // immutable per id; `pendingKey` already captures which ids matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay, activeChannel, pendingKey]);
}
