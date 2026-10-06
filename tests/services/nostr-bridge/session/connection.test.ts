import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_IDENTITY_ID, type RelayStatus } from '@/lib/relay-hub';
import { ConnectionModule, type ConnectionDeps } from '@/services/nostr-bridge/session/connection';
import { BrowserConnectionEvents } from '@/services/nostr-bridge/session/browser-events';
import { openSessionSubscriptions, type FanoutTargets } from '@/services/nostr-bridge/session/fanout';
import { SessionState } from '@/services/nostr-bridge/session/state';

const RELAY = 'wss://active.example';

const status = (over: Partial<RelayStatus>): RelayStatus => ({
  url: RELAY,
  identityId: SESSION_IDENTITY_ID,
  connection: 'connected',
  auth: 'none',
  socketGeneration: 1,
  promptCount: 0,
  openSubs: 0,
  budget: { used: 0, max: 40, parked: 0 },
  lastError: null,
  authError: null,
  ...over,
});

function setup(connectOutcome: () => Promise<void> = async () => {}) {
  const state = new SessionState();
  state.relays = [RELAY];
  state.session = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: RELAY };
  const lease = { release: vi.fn() };
  const deps: ConnectionDeps = {
    hub: {
      connect: vi.fn(connectOutcome),
      status: vi.fn(() => status({ connection: 'idle' })),
      acquireAuthLease: vi.fn(() => lease),
    },
    setRelayAccess: vi.fn(),
    resetAccess: vi.fn(),
    openSessionSubscriptions: vi.fn(),
  };
  return { state, deps, lease, conn: new ConnectionModule(state, deps) };
}

describe('session/connection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('connects: lease before handshake, fan-out before the handshake resolves, then Connected', async () => {
    const { conn, deps, state } = setup();
    const done = conn.connect();
    expect(deps.hub.acquireAuthLease).toHaveBeenCalledWith(RELAY, 'active');
    expect(deps.openSessionSubscriptions).toHaveBeenCalledWith(null);
    expect(state.connectionState.get()).toBe('Connecting');
    await done;
    expect(state.connectionState.get()).toBe('Connected');
    expect(conn.activeSocketUp()).toBe(true);
    expect(conn.generation).toBe(1);
  });

  it('marks the relay unreachable and rethrows when no handshake succeeds', async () => {
    const { conn, deps, state } = setup(async () => { throw new Error('refused'); });
    await expect(conn.connect()).rejects.toMatchObject({ message: 'no relays connected', code: 'no-relays-connected' });
    await Promise.resolve();
    expect(deps.setRelayAccess).toHaveBeenCalledWith(RELAY, 'unreachable');
    // The suffix is the code, so the banner can translate it (errorText reads a bare code).
    expect(state.connectionState.get()).toBe('Error:no-relays-connected');
  });

  it('reads a drop of a socket it saw up, and opens the gate when the hub brings it back', () => {
    const { conn, deps, state } = setup();
    conn.onHubStatus(status({ connection: 'connected' }));
    expect(state.isLoggedIn.get()).toBe(true);
    expect(state.connectionState.get()).toBe('Connected');
    conn.onHubStatus(status({ connection: 'reconnecting' }));
    expect(state.connectionState.get()).toBe('Disconnected');
    expect(deps.resetAccess).toHaveBeenCalledTimes(1);
    expect(deps.setRelayAccess).toHaveBeenCalledWith(RELAY, 'unreachable');
    conn.onHubStatus(status({ connection: 'reconnecting' }));
    expect(deps.resetAccess).toHaveBeenCalledTimes(1);
  });

  it('ignores other identities, relays not browsed, and everything while tearing down', () => {
    const { conn, state } = setup();
    conn.onHubStatus(status({ identityId: 'dm-call' }));
    conn.onHubStatus(status({ url: 'wss://other.example' }));
    conn.tearingDown = true;
    conn.onHubStatus(status({}));
    expect(state.isLoggedIn.get()).toBe(false);
  });

  it('shows Authenticating only over a state that carries no verdict', () => {
    const { conn, deps, state } = setup();
    conn.onHubStatus(status({ auth: 'challenged' }));
    expect(deps.setRelayAccess).toHaveBeenCalledWith(RELAY, 'authenticating');
    vi.mocked(deps.setRelayAccess).mockClear();
    state.relayAccess.set({ [RELAY]: 'restricted' });
    conn.onHubStatus(status({ auth: 'signing' }));
    expect(deps.setRelayAccess).not.toHaveBeenCalled();
  });

  it('retries only when the hub holds nothing for the active relay', () => {
    const { conn, deps } = setup();
    vi.mocked(deps.hub.status).mockReturnValue(status({ connection: 'reconnecting' }));
    conn.retryConnectionNow();
    expect(deps.hub.connect).not.toHaveBeenCalled();
    vi.mocked(deps.hub.status).mockReturnValue(status({ connection: 'idle' }));
    conn.retryConnectionNow();
    expect(deps.hub.connect).toHaveBeenCalledTimes(1);
  });

  it('keeps one lease per browsed relay and releases it on teardown', () => {
    const { conn, deps, lease } = setup();
    conn.syncActiveRelayLease();
    conn.syncActiveRelayLease();
    expect(deps.hub.acquireAuthLease).toHaveBeenCalledTimes(1);
    conn.releaseActiveLease();
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});

describe('session/browser-events', () => {
  it('flips to Offline and retries on online and on a visible tab while not Connected', () => {
    const state = new SessionState();
    state.session = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: RELAY };
    const retry = vi.fn();
    const events = new BrowserConnectionEvents(state, retry);
    events.wire();
    events.wire();
    window.dispatchEvent(new Event('offline'));
    expect(state.connectionState.get()).toBe('Offline');
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(retry).toHaveBeenCalledTimes(2);
    events.unwire();
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(2);
  });
});

describe('session/fanout', () => {
  it('opens P0 now, P2 on the next microtask, then the per-group REQs, active channel first', async () => {
    const log: string[] = [];
    const rec = (name: string) => () => { log.push(name); };
    const t: FanoutTargets = {
      myPubkey: () => 'me',
      access: { preflight: rec('preflight') },
      metadata: { subscribe: rec('metadata') },
      membership: { subscribeRelayWide: rec('relayWide'), subscribeMyAuthoredGroups: rec('authored'), ensurePerGroup: (g) => log.push(`adminMember:${g}`) },
      lists: { subscribeContactList: rec('contacts'), subscribeMuteList: rec('mutes') },
      media: { subscribe: rec('media') },
      voicePresence: { subscribe: rec('voice') },
      pings: { subscribeLivePings: rec('pings') },
      reactions: { ensurePerGroup: (g) => log.push(`reactions:${g}`) },
      ensureUserMetadata: (pk) => log.push(`kind0:${pk}`),
      activeGroupId: () => 'b',
      subscribeGroupMessages: (g) => log.push(`messages:${g}`),
      dmInbox: { wanted: true, subscribed: false, subscribe: rec('dms') },
    };
    openSessionSubscriptions(t, { messages: ['a', 'b'], reactions: ['a'], adminMember: ['b'], metadata: ['pk'] });
    expect(log).toEqual(['preflight', 'metadata', 'kind0:me']);
    await Promise.resolve();
    expect(log.slice(3)).toEqual([
      'relayWide', 'contacts', 'media', 'mutes', 'authored', 'voice', 'pings',
      'messages:b', 'messages:a', 'reactions:a', 'adminMember:b', 'kind0:pk', 'dms',
    ]);
  });
});
