'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  CHANNEL_SCROLL_NEAR_BOTTOM_PX,
  rememberChannelScrollPosition,
  restoreChannelScrollPosition,
} from '@/lib/channel-scroll-position';

interface UseChannelScrollPositionOptions {
  readonly scrollKey: string | null;
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly itemCount: number;
  readonly disabled?: boolean;
  readonly nearBottomPx?: number;
  readonly onNearBottomChange?: (nearBottom: boolean) => void;
}

export function useChannelScrollPosition({
  scrollKey,
  scrollRef,
  itemCount,
  disabled = false,
  nearBottomPx = CHANNEL_SCROLL_NEAR_BOTTOM_PX,
  onNearBottomChange,
}: UseChannelScrollPositionOptions): void {
  const restoredKeyRef = useRef<string | null>(null);
  const onNearBottomChangeRef = useRef(onNearBottomChange);

  useEffect(() => {
    onNearBottomChangeRef.current = onNearBottomChange;
  }, [onNearBottomChange]);

  useLayoutEffect(() => {
    if (!scrollKey) return;
    return () => {
      const el = scrollRef.current;
      if (el) rememberChannelScrollPosition(scrollKey, el, nearBottomPx);
    };
  }, [nearBottomPx, scrollKey, scrollRef]);

  useLayoutEffect(() => {
    if (!scrollKey) {
      restoredKeyRef.current = null;
      return;
    }

    if (disabled) {
      restoredKeyRef.current = scrollKey;
      return;
    }

    if (itemCount <= 0 || restoredKeyRef.current === scrollKey) return;

    const applyRestore = () => {
      const el = scrollRef.current;
      if (!el) return;
      const result = restoreChannelScrollPosition(scrollKey, el, nearBottomPx);
      onNearBottomChangeRef.current?.(result.nearBottom);
    };

    applyRestore();
    restoredKeyRef.current = scrollKey;

    const frame = requestAnimationFrame(applyRestore);
    return () => cancelAnimationFrame(frame);
  }, [disabled, itemCount, nearBottomPx, scrollKey, scrollRef]);

  useEffect(() => {
    if (!scrollKey) return;
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const snapshot = rememberChannelScrollPosition(scrollKey, el, nearBottomPx);
      if (snapshot) onNearBottomChangeRef.current?.(snapshot.nearBottom);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [nearBottomPx, scrollKey, scrollRef]);
}
