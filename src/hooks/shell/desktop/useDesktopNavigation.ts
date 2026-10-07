'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { nostrActions, useBridge } from '@/services/nostr-bridge';
import { initializeWot } from '@/services/wot';
import { shortHost } from '@/utils/relay-url/url-host';
import { subscribeVoiceJump } from '@/services/voice/jump-to-voice';
import { useChatStore } from '@/store/chat';
import { useRelayDeepLink } from '@/hooks/relay/useRelayDeepLink';
import type { View } from '@/utils/shell/desktop/view';

/**
 * Where the desktop shell is: its `view`, plus every way something outside
 * the shell can move it (search results, `?c=` / `?relay=` deep links, the
 * voice bar's "jump back to call"), and the URL kept in step with it.
 *
 * Desktop navigation is this hook's `view` state. `bridge.setActiveGroup`
 * only follows it (see the layout effect); nothing below the shell may call
 * it directly. `navigation-invariants.test.ts` and `deep-link-gate.test.ts`
 * read this file.
 */
export function useDesktopNavigation(
  relay: string,
  /** Stable setter: the voice jump closes the mobile drawer. */
  setSidebarOpen: (open: boolean) => void,
) {
  // Remembered so leaving the full-screen feed returns to the room you were
  // in rather than an empty pane. State adjusted during render (the
  // "previous value" pattern), so it is read in the same render it is set
  // and never from a ref whose write may belong to a discarded render.
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);
  if (view.kind === 'group' && view.groupId !== lastGroupId) setLastGroupId(view.groupId);

  // useLayoutEffect (not useEffect): we need the bridge's setActiveGroup
  // to run BEFORE the browser paints. If it runs in useEffect, the chat
  // panel renders once with the stale per-group status (e.g.
  // 'empty-confirmed' from a previous visit) BEFORE the bridge restarts
  // the sub and flips status to 'loading', the user sees a one-frame
  // flash of "No messages yet" → spinner. useLayoutEffect schedules the
  // state change before paint so only the final state ('loading') hits
  // the screen. Calling the bridge directly keeps the call truly synchronous,
  // the async `nostrActions.setActiveGroup` indirection would defer the
  // status flip to a microtask, after the first paint had already
  // landed. The bridge comes from the provider and is null until it has
  // started, so the effect also runs again when it arrives.
  const bridge = useBridge();
  useLayoutEffect(() => {
    if (view.kind === 'group') {
      bridge?.setActiveGroup(view.groupId);
      // Mirror into the chat store so `isUserWatchingChannel` returns true
      // here too. Without this, desktop's read-state machinery is silently
      // disabled (the gate stays false → cursor never advances → unread
      // counts never clear). Mobile sets these in `selectGroup`; desktop
      // routes through `setView` instead, so we mirror in the same effect.
      useChatStore.setState({ activeChannelId: view.groupId });
    } else {
      bridge?.setActiveGroup(null);
      useChatStore.setState({ activeChannelId: null });
    }
  }, [view, bridge]);

  // Probe the nostr-wot extension on mount (and on visibility change). Without
  // this the engine stays disabled until the user opens the Preferences tab,
  // so a persisted "WoT on" toggle wouldn't take effect on cold load.
  useEffect(() => {
    initializeWot();
  }, []);

  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const switchFromDeepLink = useRelayDeepLink();

  // Search results ask to jump here (see `pendingJump` in the chat store).
  // The search bar is mounted inside the channel header, several levels
  // below this state, so the store is the handoff. We reuse the same
  // `pendingMessageId` path the `?m=` deep link uses, it already waits for
  // the message to load before scrolling and flashing.
  const pendingJump = useChatStore((s) => s.pendingJump);
  useEffect(() => {
    if (!pendingJump) return;
    // Navigate via `setView`, NOT `bridge.setActiveGroup`. What's on screen
    // is this component's `view` state; the bridge call only moves the relay
    // subscription, so calling it alone changes the data behind a panel the
    // user never gets sent to. The `[view]` layout effect below issues the
    // bridge call as a consequence of navigating.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The rule's shape would be a `useChatStore.subscribe` in a mount effect; the store selector above is already that subscription, the handoff is read once and consumed, and `navigation-invariants.test.ts` pins this effect's text. Re-examined in audits/obelisk/round9/FIX-lint-warnings.md: no stale closure, no loop (consumeJump nulls the trigger).
    setView({ kind: 'group', groupId: pendingJump.groupId });
    if (pendingJump.messageId) setPendingMessageId(pendingJump.messageId);
    useChatStore.getState().consumeJump();
  }, [pendingJump]);

  // Deep-link: ?c=<groupId>[&m=<messageId>][&relay=<host>] auto-selects a
  // channel on first render, switches to the requested relay, and (when m is
  // present) scrolls/flashes the target message. We also accept ';' as a
  // separator so URLs typed casually as `?c=X;relay=Y` still parse.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = window.location.search.replace(/;/g, '&');
    const params = new URLSearchParams(search);
    const c = params.get('c');
    const m = params.get('m');
    const r = params.get('relay');
    // A relay outside the user's list is confirmed first; see
    // `useRelayDeepLink` for why the order matters.
    if (r) void switchFromDeepLink(r);
    // `?s=feed`, shared by the mobile shell's screen param, so one link
    // ("Open in Obelisk" from the public viewer) lands on the feed whichever
    // shell picks it up. A channel deep-link still wins: it is more specific.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Deep-link seam. Lazy initial state is legal here (the shell mounts with ssr:false) but would activate the group on the current relay before `switchFromDeepLink` has been asked for the linked one, reordering the sequence `deep-link-gate.test.ts` protects. Left as a documented exception; see audits/obelisk/round9/FIX-lint-warnings.md.
    if (!c && params.get('s') === 'feed') setView({ kind: 'feed' });
    if (c) setView({ kind: 'group', groupId: c });
    if (m) setPendingMessageId(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the active group + relay so refresh / share works.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (view.kind === 'group') url.searchParams.set('c', view.groupId);
    else url.searchParams.delete('c');
    if (view.kind === 'feed') url.searchParams.set('s', 'feed');
    else url.searchParams.delete('s');
    if (relay) url.searchParams.set('relay', shortHost(relay));
    else url.searchParams.delete('relay');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [view, relay]);

  // Voice status bar "jump back to call" → switch relay if the call lives
  // on a different one (so `useGroups()` resolves the channel before we set
  // the view), then set the view to the call's channel. Cross-relay jumps
  // currently tear down voice signaling because the bridge pool resets on
  // switchRelay, tracked in docs/sfu-known-bugs.md.
  useEffect(() => {
    return subscribeVoiceJump(async ({ channelId, relayUrl }) => {
      if (relayUrl && relayUrl !== relay) {
        try { await nostrActions.switchRelay(relayUrl); }
        catch (err) { console.warn('[appshell] switchRelay for voice jump failed', err); }
      }
      setView({ kind: 'group', groupId: channelId });
      setSidebarOpen(false);
    });
  }, [relay, setSidebarOpen]);

  return { view, setView, lastGroupId, pendingMessageId, setPendingMessageId };
}
