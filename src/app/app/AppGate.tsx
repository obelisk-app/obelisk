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
import { useIsLoggedIn, useConfiguredRelays, useGroups } from '@/lib/nostr-bridge';
import { usePubkey } from '@nostr-wot/data/react';
const useMyPubkey = usePubkey;
import ProfileEditor from '@/components/ProfileEditor';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useAutoMarkRead } from '@/hooks/useAutoMarkRead';
import { ensureReadStateStoreForAccount } from '@/store/read-state';
import { ensureDMStoreForAccount } from '@/store/dm';
import { ensureModerationStoreForAccount } from '@/store/moderation';
import { ensureForumFollowForAccount } from '@/store/chat/forum-follow-slice';

/**
 * Per-account persistence wiring. Add new per-account stores here — AppGate
 * loops through this on every login change. Forgetting an entry silently
 * leaks state across accounts on the same browser.
 */
const PER_ACCOUNT_STORES = [
  ensureReadStateStoreForAccount,
  ensureDMStoreForAccount,
  ensureModerationStoreForAccount,
  ensureForumFollowForAccount,
] as const;
import { startGroupsRelaySync, startDMRelaySync } from '@/lib/read-state/relay-sync';
import { fetchProfile, fetchRelayList } from '@nostr-wot/data';
import { PROFILE_RELAYS } from '@/lib/nostr-bridge/client';

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
  const relays = useConfiguredRelays();
  const groups = useGroups();

  useEffect(() => {
    if (!myPubkey) return;
    for (const ensure of PER_ACCOUNT_STORES) ensure(myPubkey);
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
    const searchRelays = Array.from(new Set([...relays, ...PROFILE_RELAYS]));
    void fetchRelayList(myPubkey, searchRelays).then((list) => {
      if (cancelled) return;
      // NIP-65 union of read+write — matches DM coverage requirement.
      const found = list ? Array.from(new Set([...list.read, ...list.write])) : [];
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
 *
 * Decision tree (per pubkey, once per browser):
 *   - "seen" flag in localStorage → never prompt again.
 *   - "just-generated" flag (set by LoginModal on `generate`) → no kind:0
 *     can possibly exist on relays; show setup immediately.
 *   - otherwise → actually fetch the kind:0 from the user's outbox + the
 *     fallback profile aggregators and decide based on the result. If a
 *     name/displayName is found, mark seen and skip. Otherwise (cold key
 *     with no published profile, or fetch failed) show setup.
 *
 * The previous implementation watched the SDK's `useProfile` slot via a
 * 1500ms grace timer, which fired *before* a slow cold-start kind:0 could
 * land — existing users with a profile then briefly saw a setup screen.
 * Awaiting `fetchProfile` directly removes the race.
 */
function ProfileSetupGate() {
  const myPubkey = useMyPubkey();
  const configuredRelays = useConfiguredRelays();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!myPubkey) return;
    if (typeof window === 'undefined') return;
    const seenKey = `obelisk-dex/mobile-setup-seen/${myPubkey}`;
    if (window.localStorage.getItem(seenKey)) return;

    // Freshly generated key (set by LoginModal) — no kind:0 will arrive,
    // so skip the relay round-trip and show setup immediately.
    const justGenKey = `obelisk-dex/just-generated/${myPubkey}`;
    if (window.localStorage.getItem(justGenKey)) {
      try { window.localStorage.removeItem(justGenKey); } catch { /* ignore */ }
      setShowSetup(true);
      return;
    }

    // Existing user: actually fetch their kind:0 from the user's configured
    // relays + the fallback profile aggregators, and decide on the result.
    let cancelled = false;
    const lookupRelays = Array.from(new Set([...configuredRelays, ...PROFILE_RELAYS]));
    fetchProfile(myPubkey, lookupRelays.length > 0 ? lookupRelays : undefined)
      .then((entry) => {
        if (cancelled) return;
        if (entry && (entry.name || entry.displayName)) {
          // User already has a profile — mark seen and stay silent.
          try { window.localStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
          return;
        }
        // Either no kind:0 published, or the published one is empty.
        setShowSetup(true);
      })
      .catch(() => {
        // Network error — don't show setup on a flaky relay round; the next
        // mount will retry. Better to omit the prompt than to false-positive
        // an existing user into a setup flow that overwrites their profile.
      });
    return () => { cancelled = true; };
  }, [myPubkey, configuredRelays]);

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
