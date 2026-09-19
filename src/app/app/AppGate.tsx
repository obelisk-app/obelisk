'use client';

/**
 * Viewport gate for /app — renders the mobile shell on phones (≤sm) and the
 * existing desktop AppShell on tablets and up. The breakpoint matches
 * Tailwind's `sm` (640px) so it composes with the existing `sm:`/`md:` rules
 * elsewhere in the app.
 *
 * SSR returns `null` for the first paint; the client picks the right shell
 * once `window.matchMedia` resolves. This avoids hydration mismatches when
 * the user-agent and viewport disagree.
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
// Hoist the mobile shell's stylesheet up to the eagerly-loaded route bundle
// so it's in place before the dynamic PhoneShell chunk hydrates. Without
// this, Next.js loads the CSS only when the dynamic chunk arrives — which
// in practice means the first paint of the mobile UI is unstyled (SVG
// icons render at default browser size, etc.).
import './mobile/mobile-shell.css';
import { useIsLoggedIn } from '@/lib/nostr-bridge';
import ReadStateRoot from '@/lib/read-state/root';
import ActivityIndicator from '@/components/ActivityIndicator';
import { usePreferences } from '@/lib/preferences';
import { initSocial } from '@/lib/social/pool';

const AppShell = dynamic(() => import('./DesktopShell'), { ssr: false });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false });

const MOBILE_QUERY = '(max-width: 1023px)';

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      queueMicrotask(() => setIsMobile(false));
      return;
    }
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export default function AppGate() {
  const isMobile = useIsMobile();
  const loggedIn = useIsLoggedIn();
  const socialRelays = usePreferences().socialRelays;

  // Point @nostr-wot/data at the user's social relays before any feed read.
  // Without this the SDK would fall back to its own defaults, so a user who
  // configured their relays would still be reading from somewhere else.
  useEffect(() => {
    initSocial(socialRelays);
  }, [socialRelays]);

  if (isMobile === null) return null;
  return (
    <>
      {loggedIn ? <ReadStateRoot /> : null}
      {isMobile ? <MobileShell /> : <AppShell />}
      {!isMobile && <ActivityIndicator />}
    </>
  );
}
