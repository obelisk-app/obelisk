'use client';

/**
 * Bottom-nav tab presses: the direction-aware slide to an adjacent tab, the
 * jump to a far one, and the pop from a sub-screen back to its bare tab.
 * Top-level buttons are literal: DMs opens DMs, Servers opens the channel
 * list, etc. Sub-screens can still be popped by tapping their active tab,
 * but cross-tab switches never restore a hidden thread/channel/voice-room.
 */
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/chat/dm';
import { type ScreenName, type NavState, initialNav, urlFor } from '@/utils/shell/mobile/url-state';
import { decideTabPress, isAdjacentTabSwitch, NAV_ORDER, resolveParent } from '@/utils/shell/mobile/swipe-nav';
import { CAROUSEL_TRANSITION } from '@/utils/shell/mobile/carousel-slots';
import type { SlideDir } from './useScreenCarousel';

export interface CarouselTabsInputs {
  readonly navRef: RefObject<NavState>;
  readonly relayRef: RefObject<string | null>;
  readonly pushNav: (updater: (n: NavState) => NavState, dir?: 'forward' | 'back') => void;
  readonly setNav: Dispatch<SetStateAction<NavState>>;
  readonly setSlideDir: Dispatch<SetStateAction<SlideDir>>;
  readonly dragLayerRef: RefObject<HTMLDivElement | null>;
  readonly screensHostRef: RefObject<HTMLDivElement | null>;
  readonly suppressSlideRef: RefObject<boolean>;
  /** The pending tap-switch timer, shared with `cancelPendingTabTransition`. */
  readonly tabAnimTimerRef: RefObject<number | null>;
  readonly setIsDragging: (dragging: boolean) => void;
}

export function useCarouselTabs({
  navRef, relayRef, pushNav, setNav, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef, tabAnimTimerRef, setIsDragging,
}: CarouselTabsInputs) {
  // Tap-switch animation.
  const commitCarouselTransition = useCallback((target: ScreenName, dir: 'forward' | 'back') => {
    const current = NAV_ORDER.includes(navRef.current.screen)
      ? navRef.current.screen
      : resolveParent(navRef.current) ?? 'server';
    if (!isAdjacentTabSwitch(current, target)) {
      suppressSlideRef.current = true;
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav(() => ({ ...initialNav, screen: target }), dir);
      return;
    }

    const layer = dragLayerRef.current;
    const width = screensHostRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);

    const targetTx = dir === 'forward' ? -width : width;
    setIsDragging(true);
    if (layer && width > 0) {
      layer.style.transition = 'none';
      layer.style.transform = 'translateX(0)';
      void layer.offsetHeight;
      layer.style.transition = CAROUSEL_TRANSITION;
      layer.style.transform = `translateX(${targetTx}px)`;
    }

    if (tabAnimTimerRef.current !== null) {
      window.clearTimeout(tabAnimTimerRef.current);
    }
    tabAnimTimerRef.current = window.setTimeout(() => {
      tabAnimTimerRef.current = null;
      // Push the bare target now that the animation is done.
      // suppressSlideRef must be set BEFORE pushNav so the screen-anim
      // wrapper (if any sub-screen is involved) doesn't re-animate.
      suppressSlideRef.current = true;
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav(
        () => ({ ...initialNav, screen: target }),
        dir,
      );
      setIsDragging(false);
    }, 180);
  }, [pushNav, dragLayerRef, navRef, screensHostRef, suppressSlideRef, tabAnimTimerRef, setIsDragging]);

  // Pop to the bare top-level tab while on a sub-screen. The parent tab
  // is already at drag-curr behind the overlay, so we just slide the
  // overlay off to the right and then `replaceState` (not pushState) to
  // collapse the sub-screen entry. Using replaceState fixes the
  // "press back twice" feel, the back-stack from the bare tab leads to
  // whatever preceded the sub-screen, not back into it.
  const popToBareTab = useCallback((target: ScreenName) => {
    const overlay = screensHostRef.current?.querySelector('.drag-overlay') as HTMLElement | null;
    if (overlay) {
      overlay.style.transition = CAROUSEL_TRANSITION;
      overlay.style.transform = 'translateX(100%)';
    }
    if (tabAnimTimerRef.current !== null) {
      window.clearTimeout(tabAnimTimerRef.current);
    }
    tabAnimTimerRef.current = window.setTimeout(() => {
      tabAnimTimerRef.current = null;
      suppressSlideRef.current = true;
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      const bare: NavState = { ...initialNav, screen: target };
      setNav(bare);
      navRef.current = bare;
      setSlideDir(null);
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState({ nav: bare }, '', urlFor(bare, relayRef.current));
        } catch { /* ignore */ }
      }
      // Clear the inline transform on the (now unmounting) overlay so a
      // future overlay mounts at the correct starting position.
      if (overlay) {
        overlay.style.transition = '';
        overlay.style.transform = '';
      }
    }, 180);
  }, [navRef, relayRef, screensHostRef, setNav, setSlideDir, suppressSlideRef, tabAnimTimerRef]);

  const onTabPress = useCallback((target: ScreenName) => {
    const action = decideTabPress(navRef.current, target);
    switch (action.kind) {
      case 'noop':
        return;
      case 'pop':
        popToBareTab(action.target);
        return;
      case 'switch':
        commitCarouselTransition(action.target, action.dir);
        return;
    }
  }, [commitCarouselTransition, popToBareTab, navRef]);

  return { onTabPress };
}
