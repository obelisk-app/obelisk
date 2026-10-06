/**
 * The four teardown sequences of the session lifecycle (round 4 plan, step
 * 18): a session change, a relay switch, a logout and a disposal. Each is
 * the ordered list of lines the facade used to run inline, now as calls
 * into the module that owns the state, in exactly the same order. The order
 * is load-bearing in two ways: a REQ is released before the bookkeeping
 * that assumed it is cleared, and the stores notify their listeners in the
 * sequence the shells always saw (`reset.test.ts` pins it).
 */
import { SESSION_IDENTITY_ID, type Identity } from '@/lib/relay-hub';
import { dismissActivity } from '@/services/activity-log';
import { resetAllClientState } from '@/services/reset';
import type { PerGroupReqs } from './fanout';
import type { LifecycleTargets } from './lifecycle';

/** The hub identity before login and after logout: its sockets never answer a challenge. */
export const ANONYMOUS_IDENTITY: Identity = { id: SESSION_IDENTITY_ID, pubkey: null, signer: null, authPolicy: 'auth-when-challenged' };

/**
 * Release every REQ the session holds and restart the per-session
 * bookkeeping that assumed them, so the fan-out that follows (from
 * `connect()`) re-issues the global ones and, from the returned list, the
 * per-group ones mounted components still expect. Sockets are untouched:
 * the hub owns them. A socket drop does not come through here: the
 * registry keeps those REQs.
 */
export function resetSubscriptionState(t: LifecycleTargets): PerGroupReqs {
  t.reqs.pinned.releaseAll();
  t.connection.forgetSocketsUp();
  t.connection.generation++;
  // Capture the per-group REQs that were live so the fan-out can reopen
  // them. Without this, components mounted before login keep their store
  // listeners but have nothing feeding them.
  const perGroup: PerGroupReqs = {
    messages: t.messages.subscribedGroups(),
    reactions: t.reactions.subscribed(),
    adminMember: t.membership.perGroupSubscribed(),
    metadata: t.profiles.requestedPubkeys(),
  };
  t.reqs.closeAll();
  t.dmInbox.dropHandles();
  t.messages.forgetSubscriptions();
  t.reactions.forgetSubscriptions();
  t.moderation.forgetSubscriptions();
  t.membership.forgetSubscriptions();
  t.profiles.forgetRequested();
  t.media.markUnsubscribed();
  // The per-group REQs haven't been re-issued yet: drop any EOSE bits
  // captured from the old socket so the chat pane shows its loading
  // spinner until the resub completes.
  t.messages.resetStatus();
  t.messages.clearAllRetry();
  // Drop the background queue: it's tied to the old REQs, and the fresh
  // kind 39000 fan-out will repopulate it.
  t.messages.clearQueue();
  t.profiles.clearPendingQueue();
  t.messages.clearTimers();
  // Cancel any debounced cache flushes that were armed against the old
  // `currentRelayUrl`, the next session may target a different relay, and
  // a stale flush would write under the wrong key. The next ingest re-arms
  // flushers cleanly.
  t.messages.clearFlushers();
  t.reactions.clearFlushers();
  t.messages.clearQuerySyncFallback();
  // Re-login on the same browser keeps the in-memory bridge instance, so
  // the kind 39000 newest-wins guard would retain every `groupId ->
  // created_at` pair from the previous session (login-race Fix E; the
  // module's doc has the mechanism).
  t.metadata.forgetRevisions();
  // Clear the per-group readiness flags too: the new socket has not seen
  // 39001/39002 yet, so consumers must wait for fresh evidence before
  // deciding "not a member".
  t.membership.resetReadiness();
  // Back to "Channels loading..." while the new REQ is in flight.
  // switchRelay already does this; without it here, fresh login could
  // paint the wrong empty-state copy in the gap before the new EOSE.
  t.metadata.resetEose();
  t.dmInbox.forgetSubscriptions();
  // Forget any auth/whitelist signal we'd captured against the previous
  // socket generation: the next REQ must re-prove access, pending banner
  // downgrades die with it, and stale "Authenticating with {host}" entries
  // are dismissed rather than failed so a reconnect never flashes an error.
  t.access.reset();
  return perGroup;
}

/**
 * Everything scoped to the relay being left, after the switch has moved the
 * session onto the new one. Per-relay state that is not cleared here bleeds
 * across: A's category nesting stayed visible on B, B's metadata older than
 * A's was dropped by the newest-wins cursor (the same NIP-29 `d`-tag can
 * exist on two relays independently), and A's reactions painted on B's
 * messages. See docs/data-system.md.
 */
export function resetRelayScopedState(t: LifecycleTargets): void {
  t.metadata.clearGroups();
  t.messages.clearStore();
  t.messages.clearPendingSends();
  // `dmsByPeer` is not reset on a relay switch (DMs follow the user across
  // relays via NIP-65), so the DM sends in flight are left intact too, a DM
  // in flight when the user pivots to a new relay can still finish there.
  // Per-group caches are scoped to one relay.
  t.messages.forgetSubscriptions();
  t.reactions.forgetSubscriptions();
  t.moderation.forgetSubscriptions();
  t.membership.forgetSubscriptions();
  t.profiles.forgetRequested();
  t.media.reset();
  t.membership.resetLists();
  // Readiness too: the new relay hasn't delivered evidence yet, and voice
  // gates and member rails would still read "loaded" from the old relay.
  t.membership.resetReadiness();
  // The new relay hasn't delivered EOSE for any per-group kind 9 REQ yet, so
  // the message pane shows its loading spinner rather than the cached
  // "ok, empty" state.
  t.messages.resetStatus();
  t.messages.clearAllRetry();
  t.voicePresence.reset();
  // Pending queue entries point at filters bound to the old relay; the new
  // relay's kind 39000 fan-out will repopulate it.
  t.messages.clearQueue();
  t.profiles.clearPendingQueue();
  t.messages.clearTimers();
  // Flushes armed against the old relay URL are discarded; the seed paints
  // the new relay's cached entries and fresh ingests rebuild them.
  t.messages.clearFlushers();
  t.reactions.clearFlushers();
  t.messages.clearQuerySyncFallback();
  t.metadata.resetChildren();
  t.membership.resetCreators();
  t.reactions.clear();
  t.moderation.reset();
  t.metadata.forgetRevisions();
  t.metadata.resetEose();
  t.dmInbox.forgetSubscriptions();
  // Auth/whitelist state is per-relay; the new one hasn't been probed yet.
  // Pending downgrade timers and auth-activity entries scoped to the
  // previous relay go with it, so a stale "Authenticating with old-host"
  // toast doesn't linger after the user has already moved on.
  t.access.reset();
}

/**
 * The stores a logout empties after the teardown, so the next account on
 * this browser inherits nothing: the bridge's own and, last, every client
 * store (`src/services/reset.ts` has the full list).
 */
export function clearForLogout(t: LifecycleTargets): void {
  const { state } = t;
  state.isLoggedIn.set(false);
  t.pings.stop();
  t.bunker.ready.set(false);
  state.myPubkey.set(null);
  state.myLoginMethod.set(null);
  t.lists.resetContactList();
  t.media.reset();
  state.connectionState.set('Disconnected');
  t.metadata.clearGroups();
  t.metadata.resetEose();
  t.messages.clearStore();
  t.dmsByPeer.set({});
  t.messages.clearPendingSends();
  t.dmSend.clearPending();
  t.membership.resetLists();
  t.membership.resetReadiness();
  t.messages.resetStatus();
  t.messages.clearAllRetry();
  t.voicePresence.reset();
  // The background message-subscription queue is scoped to the previous
  // session's REQs.
  t.messages.clearQueue();
  t.profiles.clearPendingQueue();
  t.messages.clearTimers();
  t.messages.clearActiveGroup();
  // The next session's relay scope may differ; fresh ingests re-arm the
  // cache flushers from scratch.
  t.messages.clearFlushers();
  t.reactions.clearFlushers();
  t.messages.clearQuerySyncFallback();
  // The next session must re-prove relay access from scratch.
  t.access.reset();
  resetAllClientState();
}

/**
 * Tear the session down: every REQ released, the sockets dropped once
 * nostr-tools has flushed its CLOSE frames, every NIP-42 lease released and
 * the anonymous identity installed, so the next session answers AUTH for
 * nothing the previous user happened to touch.
 */
export function disposeSession(t: LifecycleTargets): void {
  t.browserEvents.unwire();
  t.pings.stop();
  t.profiles.clearPendingQueue();
  t.connection.dismissReconnectActivity(dismissActivity);
  t.connection.generation++;
  const relays = [...t.state.relays];
  // Release every REQ first (the registry CLOSEs the ones nobody else
  // holds), then drop the sockets on the next microtask so nostr-tools can
  // flush its queued CLOSE frames while they are open.
  t.reqs.closeAll();
  t.dmInbox.dropHandles();
  t.connection.forgetSocketsUp();
  queueMicrotask(() => {
    for (const url of relays) t.hub.disconnect(url);
  });
  t.reqs.pinned.releaseAll();
  t.connection.releaseActiveLease();
  t.dmInbox.releaseLeases();
  t.hub.setIdentity(ANONYMOUS_IDENTITY);
  // Drop debounced cache flushes, even though the flush schedulers are
  // session-gated, one armed just before dispose would otherwise fire after
  // the sockets are gone.
  t.messages.clearFlushers();
  t.reactions.clearFlushers();
  t.messages.clearQuerySyncFallback();
  t.voicePresence.reset();
  t.moderation.reset();
}
