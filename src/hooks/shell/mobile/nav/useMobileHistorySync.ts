'use client';

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useToastStore } from '@/store/feedback/toast';
import { useRouter } from '@/i18n/navigation';
import { useBridge } from '@/services/nostr-bridge';
import { useRelayDeepLink } from '@/hooks/relay/deep-link/useRelayDeepLink';
import { initialNav } from '@/constants/shell/mobile';
import { normalizeDeepLinkRelay } from '@/utils/relay/deep-link';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/chat/dm';
import { type NavState, urlFor, parseUrl, restoredNav } from '@/utils/shell/mobile/url-state';
import { buildSeedHistory } from '@/utils/shell/mobile/swipe-nav';
import type { SlideDir } from '../carousel/useScreenCarousel';

export interface MobileHistorySyncInputs {
  readonly isLoggedIn: boolean;
  readonly dmOptInEnabled: boolean;
  readonly currentRelayUrl: string | null | undefined;
  readonly nav: NavState;
  readonly navRef: RefObject<NavState>;
  readonly relayRef: RefObject<string | null>;
  readonly setNav: Dispatch<SetStateAction<NavState>>;
  readonly setSlideDir: Dispatch<SetStateAction<SlideDir>>;
  readonly suppressSlideRef: RefObject<boolean>;
}

/**
 * The phone shell and the browser history, kept in step: the one-shot URL
 * parse on login (including the `?relay=` deep link, which goes through
 * `useRelayDeepLink`'s confirmation), the seeded back stack with its exit
 * guard, the relay param, and `popstate`, which drives every "back".
 *
 * `deep-link-gate.test.ts` reads this file.
 */
export function useMobileHistorySync({
  isLoggedIn, dmOptInEnabled, currentRelayUrl, nav, navRef, relayRef, setNav, setSlideDir, suppressSlideRef,
}: MobileHistorySyncInputs) {
  const bridge = useBridge();
  const initReadyRef = useRef(false);
  const switchFromDeepLink = useRelayDeepLink();
  const didInitRef = useRef(false);
  const exitArmedRef = useRef<number>(0);
  const historyReplay = useRef(0);
  useEffect(() => () => { historyReplay.current++; }, []);
  const exitToastId = useRef<string | null>(null);
  const t = useTranslations();
  useEffect(() => () => {
    exitArmedRef.current = 0;
    if (exitToastId.current) useToastStore.getState().dismissToast(exitToastId.current);
    exitToastId.current = null;
  }, [nav, isLoggedIn, currentRelayUrl]);
  const router = useRouter();
  useEffect(() => {
    if (!bridge) return;
    let previous = bridge.currentRelayUrl.get();
    return bridge.currentRelayUrl.subscribe((next) => {
      if (next === previous) return;
      previous = next;
      relayRef.current = next;
      const current = navRef.current;
      if (current.groupId || current.forumGroupId || current.msgContext) {
        navRef.current = initialNav;
        setNav(initialNav);
        useChatStore.setState({ activeChannelId: null });
      }
    });
  }, [bridge, navRef, relayRef, setNav]);

  // ── initial URL parse + history seeding ─────────────────────────────
  useEffect(() => {
    if (didInitRef.current) return;
    if (!isLoggedIn) return;
    if (typeof window === 'undefined') return;
    didInitRef.current = true;
    const { nav: fromUrl, relay } = parseUrl(window.location.search);
    const saved = window.history.state?.nav as NavState | undefined;
    const parsed = saved ? restoredNav(saved) : fromUrl;
    const apply = (allowed: boolean) => {
      const target = allowed ? parsed : initialNav;
      const seedRelay = bridge?.currentRelayUrl.get() ?? currentRelayUrl ?? null;
      initReadyRef.current = true;
      // Setting state here is deliberate. Deep-link seam, same as DesktopShell's URL parse: the one-shot init also seeds the history guard and the store, and is gated on `isLoggedIn`, so it cannot be a lazy initializer without re-plumbing the sequence `navigation-invariants.test.ts` protects. See audits/obelisk/round9/FIX-lint-warnings.md.
      setNav(target);
      navRef.current = target;
      if (target.screen === 'channel' && target.groupId) {
        useChatStore.setState({ activeChannelId: target.groupId, isNearBottom: false });
      } else if (dmOptInEnabled && target.screen === 'dm-thread' && target.dmPeer) {
        useDMStore.setState({ activeDMPubkey: target.dmPeer });
      }
      // Guard entry: a sentinel sits BEHIND the current nav so the first
      // press of back lands on the guard (we re-push and arm the toast),
      // and a second press within 2 s confirms exit to the landing page.
      // For sub-screens (e.g. deep-linked into a channel) `buildSeedHistory`
      // also seeds the parent tab between the guard and the sub-screen, so
      // the channel header's back arrow climbs up to the channel list rather
      // than dropping straight onto the guard and showing the exit toast.
      if (saved && window.history.state?.phoneHistory) return; // The current app entry already has a stack; resizing must not grow it.
      const entries = buildSeedHistory(target, seedRelay);
      try {
        window.history.replaceState({ ...window.history.state, nav: undefined, phoneHistory: true, ...entries[0].state }, '', entries[0].url);
        for (let i = 1; i < entries.length; i++) {
          window.history.pushState({ ...entries[i].state, phoneHistory: true }, '', entries[i].url);
        }
      } catch { /* ignore */ }
    };
    if (relay) void switchFromDeepLink(relay).then(
      (outcome) => apply(outcome === 'switched' || outcome === 'unchanged'),
      () => apply(false),
    );
    else apply(true);
  }, [bridge, isLoggedIn, currentRelayUrl, dmOptInEnabled, switchFromDeepLink, navRef, setNav]);

  // Keep relayRef + URL relay param in sync without pushing history entries.
  useEffect(() => {
    relayRef.current = currentRelayUrl ?? null;
    if (typeof window === 'undefined') return;
    if (!initReadyRef.current) return;
    const url = urlFor(navRef.current, currentRelayUrl ?? null);
    try {
      window.history.replaceState(window.history.state, '', url);
    } catch { /* ignore */ }
  }, [currentRelayUrl, navRef, relayRef]);

  // ── popstate: drives all "back" navigation ──────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: PopStateEvent) => {
      const s = (e.state ?? null) as { nav?: NavState; guard?: boolean } | null;
      if (s?.guard) {
        const now = Date.now();
        if (now - exitArmedRef.current < 2000) {
          exitArmedRef.current = 0;
          if (exitToastId.current) useToastStore.getState().dismissToast(exitToastId.current);
          router.push('/');
          return;
        }
        exitArmedRef.current = now;
        if (exitToastId.current) useToastStore.getState().dismissToast(exitToastId.current);
        exitToastId.current = useToastStore.getState().pushToast({ title: t('mobile.navigation.pressBackAgain'), body: '', durationMs: 2000 });
        // Re-push current nav so the user stays on their screen.
        try {
          window.history.pushState({ nav: navRef.current, phoneHistory: true }, '', urlFor(navRef.current, relayRef.current));
        } catch { /* ignore */ }
        return;
      }
      if (s?.nav) {
        if (exitToastId.current) useToastStore.getState().dismissToast(exitToastId.current);
        const destination = restoredNav(s.nav);
        const generation = ++historyReplay.current;
        const requested = new URLSearchParams(window.location.search).get('relay');
        const apply = (allowed: boolean) => {
          if (generation !== historyReplay.current) return;
          initReadyRef.current = true;
          const next = allowed ? destination : initialNav;
          const prev = navRef.current.screen;
          const isSettingsTabSwitch =
            (prev === 'settings-profile' && next.screen === 'settings-prefs') ||
            (prev === 'settings-prefs' && next.screen === 'settings-profile');
          // The msg-actions sheet floats over a base screen with its own
          // vertical slide-up animation. Any popstate that opens or closes it
          // must NOT also animate the base
          // layer, otherwise the channel underneath slides laterally while the
          // sheet appears/disappears, which reads as a glitchy refresh.
          const isSheetTransition = prev === 'msg-actions' || next.screen === 'msg-actions';
          if (isSettingsTabSwitch || isSheetTransition) {
            suppressSlideRef.current = true;
            setSlideDir(null);
          } else {
            setSlideDir('back');
          }
          setNav(next);
          navRef.current = next;
          useChatStore.setState({
            activeChannelId: next.screen === 'channel' ? next.groupId : null,
            isNearBottom: false,
          });
          useDMStore.setState({ activeDMPubkey: dmOptInEnabled && next.screen === 'dm-thread' ? next.dmPeer : null });
        };
        if (requested && normalizeDeepLinkRelay(requested) !== normalizeDeepLinkRelay(relayRef.current ?? '')) {
          initReadyRef.current = false;
          navRef.current = initialNav;
          setNav(initialNav);
          useChatStore.setState({ activeChannelId: null });
          void switchFromDeepLink(requested).then(
            (outcome) => apply(outcome === 'switched' || outcome === 'unchanged'),
            () => apply(false),
          );
        } else apply(true);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [t, router, dmOptInEnabled, navRef, relayRef, setNav, setSlideDir, suppressSlideRef, switchFromDeepLink]);
}
