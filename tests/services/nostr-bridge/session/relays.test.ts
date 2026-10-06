import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayRail } from '@/services/nostr-bridge/session/relays';
import type { LifecycleTargets } from '@/services/nostr-bridge/session/lifecycle';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { DEFAULT_RELAYS } from '@/services/nostr-bridge/relay-list';
import { RELAYS_KEY } from '@/services/nostr-bridge/session-storage';

function rail() {
  const state = new SessionState();
  const pings = { stop: vi.fn(), recordRelayUse: vi.fn(), syncBackgroundWatch: vi.fn() };
  const t = { state, pings } as Pick<LifecycleTargets, 'state' | 'pings'>;
  const switchRelay = vi.fn();
  // Only the rail half is exercised here; the switch itself is bridge.test.ts's.
  const r = new RelayRail(t as LifecycleTargets, { connect: vi.fn(), persist: vi.fn() });
  r.switchRelay = switchRelay;
  return { r, state, pings, switchRelay };
}

describe('session/relays (the rail)', () => {
  afterEach(() => window.localStorage.clear());

  it('restores the stored rail, merging the defaults back in and writing the repair', () => {
    window.localStorage.setItem(RELAYS_KEY, JSON.stringify(['wss://mine.example', 'wss://mine.example']));
    const { r, state } = rail();
    r.restore();
    expect(state.configuredRelays.get()).toEqual(['wss://mine.example', ...DEFAULT_RELAYS]);
    expect(JSON.parse(window.localStorage.getItem(RELAYS_KEY)!)).toEqual(state.configuredRelays.get());
  });

  it('ignores a corrupt or empty stored rail', () => {
    window.localStorage.setItem(RELAYS_KEY, '{not json');
    const { r, state } = rail();
    r.restore();
    expect(state.configuredRelays.get()).toEqual([...DEFAULT_RELAYS]);
  });

  it('adds a public relay to the rail only, and refuses a non-public one', async () => {
    const { r, state, switchRelay } = rail();
    await r.addRelay('wss://new.example');
    expect(state.configuredRelays.get()).toContain('wss://new.example');
    expect(state.relays).toEqual([DEFAULT_RELAYS[0]]);
    expect(switchRelay).not.toHaveBeenCalled();
    await expect(r.addRelay('ws://localhost:7777')).rejects.toThrow();
  });

  it('removes a relay, never empties the rail, and moves off the relay being browsed', async () => {
    const { r, state, pings, switchRelay } = rail();
    await r.addRelay('wss://new.example');
    state.currentRelayUrl.set('wss://new.example');
    await r.removeRelay('wss://new.example');
    expect(state.configuredRelays.get()).not.toContain('wss://new.example');
    expect(pings.syncBackgroundWatch).toHaveBeenCalled();
    expect(switchRelay).toHaveBeenCalledWith(state.configuredRelays.get()[0]);
    state.configuredRelays.set(['wss://only.example']);
    await r.removeRelay('wss://only.example');
    expect(state.configuredRelays.get()).toEqual(['wss://only.example']);
  });
});
