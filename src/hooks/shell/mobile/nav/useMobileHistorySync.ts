'use client';

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useToastStore } from '@/store/feedback/toast';
import { useRouter } from '@/i18n/navigation';
import { useConfiguredRelays } from '@/services/nostr-bridge';
import { useRelayDeepLink } from '@/hooks/relay/deep-link/useRelayDeepLink';
import { classifyDeepLinkRelay } from '@/utils/relay/deep-link';
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
  const configuredRelays = useConfiguredRelays();
  const switchFromDeepLink = useRelayDeepLink();
  const didInitRef = useRef(false);
  const exitArmedRef = useRef<number>(0);
  const exitToastId = useRef<string | null>(null);
  const t = useTranslations();
  useEffect(() => () => {
    exitArmedRef.current = 0;
    if (exitToastId.current) useToastStore.getState().dismissToast(exitToastId.current);
    exitToastId.current = null;
  }, [nav, isLoggedIn, currentRelayUrl]);
  const router = useRouter();

  // ── initial URL parse + history seeding ─────────────────────────────
  useEffect(() => {
    if (didInitRef.current) return;
    if (!isLoggedIn) return;
    if (typeof window === 'undefined') return;
    didInitRef.current = true;
    const { nav: fromUrl, relay } = parseUrl(window.location.search);
    const saved = window.history.state?.nav as NavState | undefined;
    const parsed = saved ? restoredNav(saved) : fromUrl;
    // A relay outside the user's list is confirmed first; see
    // `useRelayDeepLink` for why the order matters. The seeded history
    // only carries the linked relay when the switch is immediate: a relay
    // still waiting on the dialog (or declined) must not be what a refresh
    // reopens.
    if (relay) void switchFromDeepLink(relay);
    const seedRelay = relay && classifyDeepLinkRelay(relay, currentRelayUrl, configuredRelays) !== 'unknown'
      ? relay
      : currentRelayUrl ?? null;
    // Setting state here is deliberate. Deep-link seam, same as DesktopShell's URL parse: the one-shot init also seeds the history guard and the store, and is gated on `isLoggedIn`, so it cannot be a lazy initializer without re-plumbing the sequence `navigation-invariants.test.ts` protects. See audits/obelisk/round9/FIX-lint-warnings.md.
    setNav(parsed);
    navRef.current = parsed;
    if (parsed.screen === 'channel' && parsed.groupId) {
      useChatStore.setState({ activeChannelId: parsed.groupId, isNearBottom: false });
    } else if (dmOptInEnabled && parsed.screen === 'dm-thread' && parsed.dmPeer) {
      useDMStore.setState({ activeDMPubkey: parsed.dmPeer });
    }
    // Guard entry: a sentinel sits BEHIND the current nav so the first
    // press of back lands on the guard (we re-push and arm the toast),
    // and a second press within 2 s confirms exit to the landing page.
    // For sub-screens (e.g. deep-linked into a channel) `buildSeedHistory`
    // also seeds the parent tab between the guard and the sub-screen, so
    // the channel header's back arrow climbs up to the channel list rather
    // than dropping straight onto the guard and showing the exit toast.
    if (saved && window.history.state?.phoneHistory) return; // The current app entry already has a stack; resizing must not grow it.
    const entries = buildSeedHistory(parsed, seedRelay);
    try {
      window.history.replaceState({ ...window.history.state, nav: undefined, phoneHistory: true, ...entries[0].state }, '', entries[0].url);
      for (let i = 1; i < entries.length; i++) {
        window.history.pushState({ ...entries[i].state, phoneHistory: true }, '', entries[i].url);
      }
    } catch { /* ignore */ }
  }, [isLoggedIn, currentRelayUrl, configuredRelays, dmOptInEnabled, switchFromDeepLink, navRef, setNav]);

  // Keep relayRef + URL relay param in sync without pushing history entries.
  useEffect(() => {
    relayRef.current = currentRelayUrl ?? null;
    if (typeof window === 'undefined') return;
    if (!didInitRef.current) return;
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
        const next = restoredNav(s.nav);
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
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [t, router, dmOptInEnabled, navRef, relayRef, setNav, setSlideDir, suppressSlideRef]);
}
