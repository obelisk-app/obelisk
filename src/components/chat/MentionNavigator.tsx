'use client';

/**
 * Floating bottom-right control inside the channel message viewport.
 *
 * Two stacked widgets:
 *   - Mention/reply nav: `↑ N ↓` — when there are unread mentions or
 *     replies in this channel, lets the user step through them in
 *     chronological order. Keyboard parity with Discord: `F7` next,
 *     `Shift+F7` previous.
 *   - Jump-to-latest: appears only when the user is scrolled away from
 *     the bottom; clicking snaps the scroller down (which also lets the
 *     auto-mark hook advance the cursor).
 *
 * The scroll target uses the existing `data-msg-id` attribute on each
 * rendered message — same convention as the deep-link "jump to message"
 * path in `DesktopShell.tsx`. Highlighting matches: a brief
 * `ring-1 ring-lc-green` flash on the focused row.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const FLASH_MS = 1800;
const NEAR_BOTTOM_PX = 80;

export interface MentionNavigatorProps {
  /** Scroll container ref — the same `scrollRef` the message list uses. */
  readonly scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Event ids of unread mentions/replies, oldest→newest. May be empty. */
  readonly eventIds: ReadonlyArray<string>;
}

function flashElement(el: Element): void {
  el.classList.add('ring-1', 'ring-lc-green');
  window.setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), FLASH_MS);
}

function scrollToId(scrollRoot: HTMLDivElement | null, id: string): boolean {
  if (!scrollRoot) return false;
  const el = scrollRoot.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashElement(el);
  return true;
}

export default function MentionNavigator({ scrollRef, eventIds }: MentionNavigatorProps) {
  // Cursor through the highlights list. Starts at the OLDEST so the first
  // press of `↓` advances to the second item, not the third — matches
  // Discord behaviour where the indicator points at "the one you'd see
  // right now if you tapped it."
  const [index, setIndex] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRoot = scrollRef.current;
  // Reset to the first highlight whenever the list grows or shrinks.
  // Keeps the user from being stuck pointing past the end after acks.
  const lastLenRef = useRef(eventIds.length);
  useEffect(() => {
    if (eventIds.length !== lastLenRef.current) {
      lastLenRef.current = eventIds.length;
      setIndex((cur) => Math.max(0, Math.min(cur, eventIds.length - 1)));
    }
  }, [eventIds.length]);

  // Track scroll position so the "jump to latest" affordance only
  // appears when the user is meaningfully scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpToLatest(dist >= NEAR_BOTTOM_PX);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef.current]);

  const goNext = useCallback(() => {
    if (eventIds.length === 0) return;
    const next = Math.min(index + 1, eventIds.length - 1);
    setIndex(next);
    scrollToId(scrollRef.current, eventIds[next]);
  }, [eventIds, index, scrollRef]);

  const goPrev = useCallback(() => {
    if (eventIds.length === 0) return;
    const prev = Math.max(index - 1, 0);
    setIndex(prev);
    scrollToId(scrollRef.current, eventIds[prev]);
  }, [eventIds, index, scrollRef]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [scrollRef]);

  // Keyboard shortcuts — F7 / Shift+F7 (Discord parity). Only fire when
  // the focus isn't inside an input/textarea so typing in the composer
  // doesn't get hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t?.isContentEditable ?? false)) return;
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const hasHighlights = eventIds.length > 0;

  if (!hasHighlights && !showJumpToLatest) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      {hasHighlights && (
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-lc-border bg-lc-dark/90 px-2 py-1 text-xs text-lc-white shadow-lg backdrop-blur"
          role="group"
          aria-label="Mention navigation"
        >
          <button
            onClick={goPrev}
            disabled={index === 0}
            className="rounded p-1 text-lc-muted transition hover:bg-lc-card hover:text-lc-green disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous mention or reply (Shift+F7)"
            title="Previous (Shift+F7)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <span className="px-1 tabular-nums">
            <span className="font-semibold text-lc-green">{index + 1}</span>
            <span className="mx-1 text-lc-muted">/</span>
            <span>{eventIds.length}</span>
            <span className="ml-1 text-lc-muted">{eventIds.length === 1 ? 'mention' : 'mentions'}</span>
          </span>
          <button
            onClick={goNext}
            disabled={index >= eventIds.length - 1}
            className="rounded p-1 text-lc-muted transition hover:bg-lc-card hover:text-lc-green disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next mention or reply (F7)"
            title="Next (F7)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
      {showJumpToLatest && (
        <button
          onClick={jumpToLatest}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-lc-border bg-lc-dark/90 text-lc-muted shadow-lg backdrop-blur transition hover:bg-lc-card hover:text-lc-green"
          aria-label="Jump to latest message"
          title="Jump to latest"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}
