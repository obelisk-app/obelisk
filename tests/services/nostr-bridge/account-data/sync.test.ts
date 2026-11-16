import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { startCommunityConnectionsSync } from '@/services/nostr-bridge/account-data/sync';
import { useChannelPrefsStore } from '@/store/chat/channel-prefs';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import { COMMUNITY_CONNECTIONS_ID } from '@/constants/chat/community-connections';

const mocks = vi.hoisted(() => ({ query: vi.fn(), publish: vi.fn(), subscribe: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('@/services/nostr-bridge/facade/page-hub', () => ({ pageRelayHub: () => ({
  query: mocks.query, publish: mocks.publish, subscribe: mocks.subscribe, setIdentity: vi.fn(), removeIdentity: vi.fn(),
}) }));
vi.mock('@/services/nostr-bridge/concord/storage', () => ({ openConcordStorage: async () => ({ getItem: mocks.get, setItem: mocks.set }) }));
vi.mock('@/services/nostr-bridge/account-data/relays', () => ({ accountDataRelays: async () => ['wss://inbox.example'] }));
const secret = generateSecretKey(), pubkey = getPublicKey(secret);
const key = nip44.v2.utils.getConversationKey(secret, pubkey);
let stop: (() => void) | undefined;
function setup() {
  let rail = ['wss://initial.example/'];
  let listener = (_next: string[]) => {};
  const setRail = (next: string[]) => { rail = next; listener(next); };
  const bridge = { getNipSigner: () => ({ pubkey,
    nip44Encrypt: async (_pubkey: string, text: string) => nip44.v2.encrypt(text, key),
    nip44Decrypt: async (_pubkey: string, text: string) => nip44.v2.decrypt(text, key),
    signEvent: async (event: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(event, secret),
  }), captureSessionGuard: () => () => {}, getSessionGeneration: () => 1,
  configuredRelays: { get: () => rail, subscribe: (fn: typeof listener) => { listener = fn; return () => {}; } },
  restoreCommunityConnections: setRail,
  } as unknown as BridgeImpl;
  stop = startCommunityConnectionsSync(bridge);
  return { setRail, rail: () => rail };
}
function snapshot(relays: Record<string, { at: number; value: true | null }>) {
  return { version: 1, relays, channels: {} };
}
function event(doc: ReturnType<typeof snapshot>) {
  return finalizeEvent({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', COMMUNITY_CONNECTIONS_ID]], content: nip44.v2.encrypt(JSON.stringify(doc), key) }, secret);
}
async function initialized() { await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalled()); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ events: [], perRelay: { 'wss://inbox.example': 'eose' } });
  mocks.publish.mockResolvedValue([{ status: 'ok' }]);
  mocks.subscribe.mockReturnValue({ release: vi.fn() });
  useChannelPrefsStore.setState({ prefs: {} });
});
afterEach(() => { stop?.(); vi.useRealTimers(); });
it('restores another device rail from signed self-encrypted inbox data', async () => {
  mocks.query.mockResolvedValue({ events: [event(snapshot({ 'wss://saved.example/': { at: Date.now(), value: true } }))], perRelay: {} });
  const app = setup(); await initialized();
  expect(app.rail()).toEqual(['wss://saved.example']);
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('does not erase local preferences or publish defaults after a timed out read', async () => {
  mocks.query.mockResolvedValue({ events: [], perRelay: { 'wss://inbox.example': 'timeout' } });
  setup();
  useChannelPrefsStore.setState({ prefs: { 'wss://initial.example/|general': { notify: 'all' } } });
  await initialized();
  expect(useChannelPrefsStore.getState().prefs).toHaveProperty('wss://initial.example/|general');
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('publishes removals as encrypted tombstones and retains concurrent remote additions', async () => {
  mocks.get.mockResolvedValue(JSON.stringify(snapshot({ 'wss://initial.example/': { at: 1, value: true } })));
  const app = setup(); await initialized(); vi.useFakeTimers();
  app.setRail(['wss://other.example/']);
  mocks.subscribe.mock.calls[0][0].onEvent(event(snapshot({ 'wss://remote.example/': { at: 2, value: true } })));
  await vi.advanceTimersByTimeAsync(1500);
  expect(mocks.publish).toHaveBeenCalled();
  const request = mocks.publish.mock.calls.at(-1)![0];
  expect(request.relays).toEqual(['wss://inbox.example']); expect(request.authMode).toBe('never');
  expect(request.event.content).not.toContain('example');
  const saved = JSON.parse(nip44.v2.decrypt(request.event.content, key));
  expect(saved.relays['wss://initial.example'].value).toBeNull();
  expect(saved.relays['wss://other.example'].value).toBe(true);
  expect(saved.relays['wss://remote.example'].value).toBe(true);
});
it('ignores an event signed by a different account', async () => {
  const foreign = finalizeEvent({ kind: 30078, created_at: 1, tags: [['d', COMMUNITY_CONNECTIONS_ID]], content: 'invalid' }, generateSecretKey());
  mocks.query.mockResolvedValue({ events: [foreign], perRelay: {} });
  const app = setup(); await initialized();
  expect(app.rail()).toEqual(['wss://initial.example/']); expect(mocks.publish).not.toHaveBeenCalled();
});
