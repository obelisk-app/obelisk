'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isTypingTarget, NEAR_BOTTOM_PX, scrollToId } from '@/components/chat/mentions/mention-scroll';

/**
 * Stepping through a channel's unread mentions and replies, and whether the
 * reader is far enough from the bottom to offer "jump to latest". F7 and
 * Shift+F7 step too, unless the focus is in a text field.
 */
export function useMentionNavigation(
  scrollRef: RefObject<HTMLDivElement | null>,
  eventIds: ReadonlyArray<string>,
) {
  // Cursor through the highlights list. Starts at the OLDEST so the first
  // press of `↓` advances to the second item, not the third: matches
  // Discord behaviour where the indicator points at "the one you'd see
  // right now if you tapped it."
  const [index, setIndex] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
  //
  // Both hosts (ChatPanel, ChannelScreen) render the scroller and this
  // navigator in the same block, so the ref is attached before this effect
  // runs and the element lives exactly as long as this component does.
  // Reading `scrollRef.current` here, not in the dependency list, is the
  // same binding without a render-phase ref read.
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
  }, [scrollRef]);

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

  // Keyboard shortcuts: F7 / Shift+F7 (Discord parity). Only fire when
  // the focus isn't inside an input/textarea so typing in the composer
  // doesn't get hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  return { index, showJumpToLatest, goNext, goPrev, jumpToLatest };
}
