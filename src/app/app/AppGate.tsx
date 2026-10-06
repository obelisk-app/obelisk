'use client';

/**
 * Viewport gate for /app - renders the mobile shell on phones (≤sm) and the
 * existing desktop AppShell on tablets and up. The breakpoint matches
 * Tailwind's `sm` (640px) so it composes with the existing `sm:`/`md:` rules
 * elsewhere in the app.
 *
 * SSR returns `null` for the first paint; the client picks the right shell
 * once `window.matchMedia` resolves. This avoids hydration mismatches when
 * the user-agent and viewport disagree.
 */

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
// Hoist the mobile shell's stylesheet up to the eagerly-loaded route bundle
// so it's in place before the dynamic PhoneShell chunk hydrates. Without
// this, Next.js loads the CSS only when the dynamic chunk arrives - which
// in practice means the first paint of the mobile UI is unstyled (SVG
// icons render at default browser size, etc.).
import './mobile/mobile-shell.css';
import { useIsLoggedIn } from '@/services/nostr-bridge';
import ReadStateRoot from '@/services/read-state/root';
import ActivityIndicator from '@/components/feedback/ActivityIndicator';
import { usePreferences } from '@/services/preferences';
import { initSocial } from '@/services/social/pool';
import { useIsMobile } from '@/hooks/useIsMobile';

const AppShell = dynamic(() => import('./DesktopShell'), { ssr: false });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false });

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
