'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nostrActions, useBridge } from '@/services/nostr-bridge';
import { parseUrl, urlFor, restoredNav, type NavState } from '@/utils/shell/mobile/url-state';
import { viewForNav, navForView } from '@/utils/shell/desktop/navigation';
import { subscribeVoiceJump } from '@/services/voice/jump-to-voice';
import { useChatStore } from '@/store/chat';
import { useRelayDeepLink } from '@/hooks/relay/deep-link/useRelayDeepLink';
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
export function useDesktopNavigation(relay: string) {
  // Remembered so leaving the full-screen feed returns to the room you were
  // in rather than an empty pane. State adjusted during render (the
  // "previous value" pattern), so it is read in the same render it is set
  // and never from a ref whose write may belong to a discarded render.
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [restored, setRestored] = useState(false);
  const inherited = useRef<{ nav: NavState; view: View } | null>(null);
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

  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const messageGroup = useRef<string | null>(null);
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
    messageGroup.current = pendingJump.groupId;
    setPendingMessageId(pendingJump.messageId ?? null);
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
    const m = params.get('m');
    const r = params.get('relay');
    // A relay outside the user's list is confirmed first; see
    // `useRelayDeepLink` for why the order matters.
    if (r) void switchFromDeepLink(r);
    // Keep a phone-only destination intact until a desktop navigation replaces it.
    const saved = window.history.state?.nav as NavState | undefined;
    const source = saved ? restoredNav(saved) : parseUrl(search).nav;
    const next = viewForNav(source);
    inherited.current = { nav: source, view: next };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser navigation only after the relay deep-link confirmation has been requested.
    setView(next);
    setRestored(true);
    messageGroup.current = next.kind === 'group' ? next.groupId : null;
    if (m) setPendingMessageId(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One URL codec for both shells. Preserve framework/custom history fields and
  // an inherited phone-only destination until the user chooses a desktop view.
  useEffect(() => {
    if (!restored || typeof window === 'undefined') return;
    const source = inherited.current;
    const nav = source?.view === view ? source.nav : navForView(view);
    if (source?.view !== view) inherited.current = null;
    const url = new URL(urlFor(nav, relay), window.location.origin);
    if (new URLSearchParams(window.location.search).get('debug') === 'voice') url.searchParams.set('debug', 'voice');
    if (pendingMessageId && view.kind === 'group' && messageGroup.current === view.groupId) url.searchParams.set('m', pendingMessageId);
    window.history.replaceState({ ...window.history.state, nav }, '', url.pathname + url.search);
  }, [view, relay, restored, pendingMessageId]);

  // A history entry created on a phone remains navigable after resizing.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      // The exit sentinel belongs to phone navigation. Desktop Back skips it.
      if (event.state?.guard) { window.history.back(); return; }
      const nav = event.state?.nav ? restoredNav(event.state.nav) : parseUrl(window.location.search).nav;
      const next = viewForNav(nav);
      inherited.current = { nav, view: next };
      setView(next);
      messageGroup.current = next.kind === 'group' ? next.groupId : null;
      setPendingMessageId(new URLSearchParams(window.location.search).get('m'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Voice status bar "jump back to call" → switch relay if the call lives
  // on a different one (so `useGroups()` resolves the channel before we set
  // the view), then set the view to the call's channel. Cross-relay jumps
  // currently tear down voice signaling because the bridge pool resets on
  // switchRelay, tracked in docs/operations/sfu-known-bugs.md.
  useEffect(() => {
    return subscribeVoiceJump(async ({ channelId, relayUrl }) => {
      if (relayUrl && relayUrl !== relay) {
        try { await nostrActions.switchRelay(relayUrl); }
        catch (err) { console.warn('[appshell] switchRelay for voice jump failed', err); }
      }
      setView({ kind: 'group', groupId: channelId });
    });
  }, [relay]);

  return { view, setView, lastGroupId, pendingMessageId, setPendingMessageId };
}
