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
import { useIsLoggedIn, useMyPubkey } from '@/lib/nostr-bridge';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useAutoMarkRead } from '@/hooks/useAutoMarkRead';
import { ensureReadStateStoreForAccount } from '@/store/read-state';
import { ensureDMStoreForAccount } from '@/store/dm';
import { ensureForumFollowForAccount } from '@/store/chat/forum-follow-slice';

const AppShell = dynamic(() => import('./DesktopShell'), { ssr: false });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false });

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      setIsMobile(false);
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

/**
 * Cross-shell side-effects that are identical on mobile and desktop:
 *   - swap zustand persist keys to the active account so cursors and DM
 *     overrides don't leak across logins on the same browser
 *   - mount the auto-mark hook so cursors advance while the user is reading
 *   - mount the favicon badge so the tab title and favicon reflect unreads
 *
 * Mounted only while logged in so the hooks don't run for guests.
 */
function ReadStateRoot() {
  const myPubkey = useMyPubkey();

  useEffect(() => {
    if (!myPubkey) return;
    ensureReadStateStoreForAccount(myPubkey);
    ensureDMStoreForAccount(myPubkey);
    ensureForumFollowForAccount(myPubkey);
  }, [myPubkey]);

  useAutoMarkRead();
  useFaviconBadge();
  return null;
}

export default function AppGate() {
  const isMobile = useIsMobile();
  const loggedIn = useIsLoggedIn();
  if (isMobile === null) return null;
  return (
    <>
      {loggedIn ? <ReadStateRoot /> : null}
      {isMobile ? <MobileShell /> : <AppShell />}
    </>
  );
}
