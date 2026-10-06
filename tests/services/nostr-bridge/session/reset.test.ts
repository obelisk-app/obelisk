/**
 * The four teardown sequences, pinned line by line. They used to be inline
 * statements in the facade, and their order is load-bearing: a REQ is
 * released before the bookkeeping that assumed it is cleared, and stores
 * notify their listeners in the order the shells always saw. A reordering
 * in `session/reset.ts` turns this red.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Identity } from '@/lib/relay-hub';
import type { LifecycleTargets, MessagesLifecycle } from '@/services/nostr-bridge/session/lifecycle';
import { ConnectionModule } from '@/services/nostr-bridge/session/connection';
import {
  ANONYMOUS_IDENTITY,
  clearForLogout,
  disposeSession,
  resetRelayScopedState,
  resetSubscriptionState,
} from '@/services/nostr-bridge/session/reset';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { JsDirectMessage } from '@/services/nostr-bridge/types';

vi.mock('@/services/reset', () => ({ resetAllClientState: vi.fn() }));

function targets() {
  const log: string[] = [];
  const rec = (name: string) => () => { log.push(name); };
  const state = new SessionState();
  state.relays = ['wss://a.example'];
  for (const [key, store] of [
    ['isLoggedIn', state.isLoggedIn],
    ['myPubkey', state.myPubkey],
    ['myLoginMethod', state.myLoginMethod],
    ['connectionState', state.connectionState],
  ] as const) {
    (store as StateStore<unknown>).subscribe(() => log.push(`state.${key}`));
  }
  log.length = 0;
  const connection = new ConnectionModule(state, {
    hub: { connect: vi.fn(), status: vi.fn(), acquireAuthLease: vi.fn() },
    setRelayAccess: vi.fn(),
    resetAccess: vi.fn(),
    openSessionSubscriptions: vi.fn(),
  });
  const messages: MessagesLifecycle = {
    subscribedGroups: () => { log.push('messages.subscribedGroups'); return ['g1']; },
    activeGroupId: () => null,
    forgetSubscriptions: rec('messages.forgetSubscriptions'),
    clearStore: rec('messages.clearStore'),
    clearPendingSends: rec('messages.clearPendingSends'),
    resetStatus: rec('messages.resetStatus'),
    clearAllRetry: rec('messages.clearAllRetry'),
    clearQueue: rec('messages.clearQueue'),
    clearTimers: rec('messages.clearTimers'),
    clearFlushers: rec('messages.clearFlushers'),
    clearQuerySyncFallback: rec('messages.clearQuerySyncFallback'),
    clearActiveGroup: rec('messages.clearActiveGroup'),
  };
  const ready = new StateStore(true);
  ready.subscribe(() => log.push('bunker.ready'));
  log.length = 0;
  const dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({ p: [] });
  const t: LifecycleTargets = {
    state,
    hub: {
      setIdentity: (identity: Identity) => { log.push(identity === ANONYMOUS_IDENTITY ? 'hub.setIdentity(anonymous)' : 'hub.setIdentity'); },
      disconnect: (url: string) => { log.push(`hub.disconnect(${url})`); },
    },
    reqs: { closeAll: rec('reqs.closeAll'), pinned: { releaseAll: rec('reqs.pinned.releaseAll') } },
    connection,
    browserEvents: { wire: rec('browserEvents.wire'), unwire: rec('browserEvents.unwire') },
    bunker: { ensure: vi.fn(), ready, close: rec('bunker.close') },
    dmInbox: { dropHandles: rec('dmInbox.dropHandles'), forgetSubscriptions: rec('dmInbox.forgetSubscriptions'), releaseLeases: rec('dmInbox.releaseLeases') },
    dmSend: { clearPending: rec('dmSend.clearPending') },
    dmsByPeer,
    dmRelays: { ensureInboxPublished: vi.fn() },
    messages,
    reactions: {
      subscribed: () => { log.push('reactions.subscribed'); return ['g2']; },
      forgetSubscriptions: rec('reactions.forgetSubscriptions'),
      clearFlushers: rec('reactions.clearFlushers'),
      clear: rec('reactions.clear'),
      hasPerGroup: () => false,
    },
    moderation: { forgetSubscriptions: rec('moderation.forgetSubscriptions'), reset: rec('moderation.reset') },
    membership: {
      perGroupSubscribed: () => { log.push('membership.perGroupSubscribed'); return ['g3']; },
      forgetSubscriptions: rec('membership.forgetSubscriptions'),
      resetReadiness: rec('membership.resetReadiness'),
      resetLists: rec('membership.resetLists'),
      resetCreators: rec('membership.resetCreators'),
      hasPerGroup: () => false,
    },
    profiles: {
      requestedPubkeys: () => { log.push('profiles.requestedPubkeys'); return ['pk']; },
      forgetRequested: rec('profiles.forgetRequested'),
      clearPendingQueue: rec('profiles.clearPendingQueue'),
      syncOwn: vi.fn(),
      dispose: rec('profiles.dispose'),
    },
    media: { markUnsubscribed: rec('media.markUnsubscribed'), reset: rec('media.reset') },
    metadata: {
      forgetRevisions: rec('metadata.forgetRevisions'),
      resetEose: rec('metadata.resetEose'),
      clearGroups: rec('metadata.clearGroups'),
      resetChildren: rec('metadata.resetChildren'),
    },
    voicePresence: { reset: rec('voicePresence.reset') },
    access: { reset: rec('access.reset') },
    pings: { stop: rec('pings.stop'), recordRelayUse: vi.fn(), syncBackgroundWatch: vi.fn() },
    lists: { resetContactList: rec('lists.resetContactList'), seedContactListCache: vi.fn() },
    seedCacheForRelay: vi.fn(() => false),
    signSessionAuth: vi.fn(),
  };
  return { t, log, connection, dmsByPeer };
}

describe('session/reset', () => {
  afterEach(() => vi.useRealTimers());

  it('a session change releases every REQ, then clears the bookkeeping, in the facade order', () => {
    const { t, log, connection } = targets();
    const before = connection.generation;
    const perGroup = resetSubscriptionState(t);
    expect(perGroup).toEqual({ messages: ['g1'], reactions: ['g2'], adminMember: ['g3'], metadata: ['pk'] });
    expect(connection.generation).toBe(before + 1);
    expect(log).toEqual([
      'reqs.pinned.releaseAll',
      'messages.subscribedGroups',
      'reactions.subscribed',
      'membership.perGroupSubscribed',
      'profiles.requestedPubkeys',
      'reqs.closeAll',
      'dmInbox.dropHandles',
      'messages.forgetSubscriptions',
      'reactions.forgetSubscriptions',
      'moderation.forgetSubscriptions',
      'membership.forgetSubscriptions',
      'profiles.forgetRequested',
      'media.markUnsubscribed',
      'messages.resetStatus',
      'messages.clearAllRetry',
      'messages.clearQueue',
      'profiles.clearPendingQueue',
      'messages.clearTimers',
      'messages.clearFlushers',
      'reactions.clearFlushers',
      'messages.clearQuerySyncFallback',
      'metadata.forgetRevisions',
      'membership.resetReadiness',
      'metadata.resetEose',
      'dmInbox.forgetSubscriptions',
      'access.reset',
    ]);
  });

  it('a relay switch clears every relay-scoped store in the facade order', () => {
    const { t, log } = targets();
    resetRelayScopedState(t);
    expect(log).toEqual([
      'metadata.clearGroups',
      'messages.clearStore',
      'messages.clearPendingSends',
      'messages.forgetSubscriptions',
      'reactions.forgetSubscriptions',
      'moderation.forgetSubscriptions',
      'membership.forgetSubscriptions',
      'profiles.forgetRequested',
      'media.reset',
      'membership.resetLists',
      'membership.resetReadiness',
      'messages.resetStatus',
      'messages.clearAllRetry',
      'voicePresence.reset',
      'messages.clearQueue',
      'profiles.clearPendingQueue',
      'messages.clearTimers',
      'messages.clearFlushers',
      'reactions.clearFlushers',
      'messages.clearQuerySyncFallback',
      'metadata.resetChildren',
      'membership.resetCreators',
      'reactions.clear',
      'moderation.reset',
      'metadata.forgetRevisions',
      'metadata.resetEose',
      'dmInbox.forgetSubscriptions',
      'access.reset',
    ]);
  });

  it('a logout empties the stores in the facade order, the client stores last', async () => {
    const { resetAllClientState } = await import('@/services/reset');
    const { t, log, dmsByPeer } = targets();
    t.state.isLoggedIn.set(true);
    t.state.myPubkey.set('pk');
    t.state.myLoginMethod.set('nsec');
    t.state.connectionState.set('Connected');
    log.length = 0;
    vi.mocked(resetAllClientState).mockImplementation(() => { log.push('resetAllClientState'); });
    clearForLogout(t);
    expect(dmsByPeer.get()).toEqual({});
    expect(log).toEqual([
      'state.isLoggedIn',
      'pings.stop',
      'bunker.ready',
      'state.myPubkey',
      'state.myLoginMethod',
      'lists.resetContactList',
      'media.reset',
      'state.connectionState',
      'metadata.clearGroups',
      'metadata.resetEose',
      'messages.clearStore',
      'messages.clearPendingSends',
      'dmSend.clearPending',
      'membership.resetLists',
      'membership.resetReadiness',
      'messages.resetStatus',
      'messages.clearAllRetry',
      'voicePresence.reset',
      'messages.clearQueue',
      'profiles.clearPendingQueue',
      'messages.clearTimers',
      'messages.clearActiveGroup',
      'messages.clearFlushers',
      'reactions.clearFlushers',
      'messages.clearQuerySyncFallback',
      'access.reset',
      'resetAllClientState',
    ]);
  });

  it('a teardown releases REQs, then leases, then hands the hub the anonymous identity; sockets go a microtask later', async () => {
    const { t, log, connection } = targets();
    const before = connection.generation;
    disposeSession(t);
    expect(connection.generation).toBe(before + 1);
    expect(log).toEqual([
      'browserEvents.unwire',
      'pings.stop',
      'profiles.clearPendingQueue',
      'reqs.closeAll',
      'dmInbox.dropHandles',
      'reqs.pinned.releaseAll',
      'dmInbox.releaseLeases',
      'hub.setIdentity(anonymous)',
      'messages.clearFlushers',
      'reactions.clearFlushers',
      'messages.clearQuerySyncFallback',
      'voicePresence.reset',
      'moderation.reset',
    ]);
    await Promise.resolve();
    expect(log.at(-1)).toBe('hub.disconnect(wss://a.example)');
  });
});
