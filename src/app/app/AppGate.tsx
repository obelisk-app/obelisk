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

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
// Hoist the mobile shell's stylesheet up to the eagerly-loaded route bundle
// so it's in place before the dynamic PhoneShell chunk hydrates. Without
// this, Next.js loads the CSS only when the dynamic chunk arrives — which
// in practice means the first paint of the mobile UI is unstyled (SVG
// icons render at default browser size, etc.).
import './mobile/mobile-shell.css';
import { useIsLoggedIn, useMyPubkey, useConfiguredRelays, useGroups, useUserMetadata } from '@/lib/nostr-bridge';
import ProfileEditor from '@/components/ProfileEditor';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useAutoMarkRead } from '@/hooks/useAutoMarkRead';
import { ensureReadStateStoreForAccount } from '@/store/read-state';
import { ensureDMStoreForAccount } from '@/store/dm';
import { ensureForumFollowForAccount } from '@/store/chat/forum-follow-slice';
import { startGroupsRelaySync, startDMRelaySync } from '@/lib/read-state/relay-sync';
import { fetchMyDmRelays } from '@/lib/dm/dm';
import { PROFILE_RELAYS } from '@/lib/nostr-bridge/client';

const AppShell = dynamic(() => import('./DesktopShell'), { ssr: false });
const MobileShell = dynamic(() => import('./mobile/PhoneShell'), { ssr: false });

const MOBILE_QUERY = '(max-width: 1023px)';

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
  const relays = useConfiguredRelays();
  const groups = useGroups();

  useEffect(() => {
    if (!myPubkey) return;
    ensureReadStateStoreForAccount(myPubkey);
    ensureDMStoreForAccount(myPubkey);
    ensureForumFollowForAccount(myPubkey);
  }, [myPubkey]);

  // Per-relay groups state sync. We only know which group ids "belong to"
  // the active relay set (the bridge subscribes to messages on `this.relays`
  // — inactive relays have no group data here). Re-mount when the visible
  // group list changes so freshly-discovered groups get included in the
  // next debounced publish.
  const groupIdsKey = groups.map((g) => g.id).sort().join(',');
  useEffect(() => {
    if (!myPubkey || relays.length === 0) return;
    const ids = groups.map((g) => g.id);
    if (ids.length === 0) return;
    const cleanups = relays.map((relay) => startGroupsRelaySync(relay, ids));
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPubkey, relays.join(','), groupIdsKey]);

  // DM-state sync targets the user's NIP-65 relays so cursors converge
  // across devices regardless of which relay they're chatting on.
  const [dmRelays, setDmRelays] = useState<ReadonlyArray<string>>([]);
  useEffect(() => {
    if (!myPubkey) return;
    let cancelled = false;
    void fetchMyDmRelays({
      myPubkey,
      searchRelays: Array.from(new Set([...relays, ...PROFILE_RELAYS])),
    }).then((found) => {
      if (cancelled) return;
      // Fall back to the configured set if the user has no NIP-65 list yet
      // — better one-relay sync than no sync at all.
      setDmRelays(found.length > 0 ? found : relays);
    });
    return () => { cancelled = true; };
  }, [myPubkey, relays]);

  useEffect(() => {
    if (!myPubkey || dmRelays.length === 0) return;
    return startDMRelaySync(dmRelays);
  }, [myPubkey, dmRelays]);

  useAutoMarkRead();
  useFaviconBadge();
  return null;
}

/**
 * First-time-after-login profile setup gate. Shown for fresh accounts that
 * haven't published a kind:0 yet (or whose published name/displayName is
 * empty). Mounted in both shells via AppGate so the prompt fires on desktop
 * and mobile alike. Uses ProfileEditor in setup mode, which uploads avatars
 * to Blossom rather than asking for a pasted URL.
 */
function ProfileSetupGate() {
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!myPubkey) return;
    if (typeof window === 'undefined') return;
    const key = `obelisk-dex/mobile-setup-seen/${myPubkey}`;
    if (window.localStorage.getItem(key)) return;
    if (meta && (meta.name || meta.displayName)) {
      window.localStorage.setItem(key, '1');
      return;
    }
    // Freshly generated key (set by LoginModal) — no kind:0 will arrive,
    // so skip the grace period.
    const justGenKey = `obelisk-dex/just-generated/${myPubkey}`;
    if (window.localStorage.getItem(justGenKey)) {
      try { window.localStorage.removeItem(justGenKey); } catch { /* ignore */ }
      setShowSetup(true);
      return;
    }
    const t = setTimeout(() => {
      if (window.localStorage.getItem(key)) return;
      setShowSetup(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [myPubkey, meta]);

  const dismiss = useCallback(() => {
    if (myPubkey) {
      try { window.localStorage.setItem(`obelisk-dex/mobile-setup-seen/${myPubkey}`, '1'); } catch { /* ignore */ }
    }
    setShowSetup(false);
  }, [myPubkey]);

  if (!showSetup) return null;
  return <ProfileEditor mode="setup" onComplete={dismiss} onSkip={dismiss} />;
}

export default function AppGate() {
  const isMobile = useIsMobile();
  const loggedIn = useIsLoggedIn();
  if (isMobile === null) return null;
  return (
    <>
      {loggedIn ? <ReadStateRoot /> : null}
      {isMobile ? <MobileShell /> : <AppShell />}
      {loggedIn ? <ProfileSetupGate /> : null}
    </>
  );
}
