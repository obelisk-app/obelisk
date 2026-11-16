import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import type { RelayHub } from '@nostr-wot/relay/hub';
import { startConcordReadSync } from '@/services/nostr-bridge/concord/read-sync';
import { useConcordReadStore } from '@/store/chat/concord-read';
import { CONCORD_READ_ID } from '@/constants/chat/concord-read';
import { KIND_NIP78_APP_DATA } from '@/constants/nostr/nip-kinds';

const secret = generateSecretKey(), pubkey = getPublicKey(secret);
const key = nip44.v2.utils.getConversationKey(secret, pubkey);
const a = 'concord:community:general', b = 'concord:community:other';
const hub = { query: vi.fn(), subscribe: vi.fn(), publish: vi.fn() };
const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
const release = vi.fn();
let stop: () => void;
const signer = { pubkey,
  nip44Encrypt: async (_: string, text: string) => nip44.v2.encrypt(text, key),
  nip44Decrypt: async (_: string, text: string) => nip44.v2.decrypt(text, key),
  signEvent: async (event: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(event, secret),
};
function event(cursors: Record<string, number>) {
  return finalizeEvent({ kind: KIND_NIP78_APP_DATA, created_at: Math.floor(Date.now() / 1000), tags: [['d', CONCORD_READ_ID]], content: nip44.v2.encrypt(JSON.stringify(cursors), key) }, secret);
}
async function setup() {
  stop = startConcordReadSync(hub as unknown as RelayHub, signer, storage, 'private-test', ['wss://inbox.example'], () => {});
  await vi.waitFor(() => expect(hub.subscribe).toHaveBeenCalled());
}
beforeEach(() => {
  vi.clearAllMocks();
  storage.getItem.mockResolvedValue(null); storage.setItem.mockResolvedValue(undefined);
  hub.query.mockResolvedValue({ events: [], perRelay: { inbox: 'eose' } });
  hub.subscribe.mockReturnValue({ release }); hub.publish.mockResolvedValue([{ status: 'ok' }]);
});
afterEach(() => { stop?.(); vi.useRealTimers(); });
it('restores signed self-encrypted cursors without publishing defaults', async () => {
  hub.query.mockResolvedValue({ events: [event({ [a]: 100 })], perRelay: {} });
  await setup();
  expect(useConcordReadStore.getState().cursors[a]).toBe(100);
  expect(hub.publish).not.toHaveBeenCalled();
});
it('merges concurrent devices monotonically and publishes only ciphertext to the inbox', async () => {
  await setup(); vi.useFakeTimers();
  useConcordReadStore.getState().merge(pubkey, { [a]: 200 });
  hub.subscribe.mock.calls[0][0].onEvent(event({ [a]: 100, [b]: 300 }));
  await vi.advanceTimersByTimeAsync(2500);
  const request = hub.publish.mock.calls.at(-1)![0];
  expect(request.relays).toEqual(['wss://inbox.example']); expect(request.authMode).toBe('never');
  expect(JSON.stringify(request.event)).not.toContain(a);
  expect(JSON.parse(nip44.v2.decrypt(request.event.content, key))).toEqual({ [a]: 200, [b]: 300 });
});
it('does not publish over an unavailable remote snapshot', async () => {
  hub.query.mockResolvedValue({ events: [], perRelay: { inbox: 'timeout' } });
  await setup(); vi.useFakeTimers();
  useConcordReadStore.getState().merge(pubkey, { [a]: 200 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(hub.publish).not.toHaveBeenCalled();
});
it('retries a rejected publish without advancing acknowledgement', async () => {
  await setup(); vi.useFakeTimers();
  hub.publish.mockResolvedValueOnce([{ status: 'error' }]);
  useConcordReadStore.getState().merge(pubkey, { [a]: 200 });
  await vi.advanceTimersByTimeAsync(33_000);
  expect(hub.publish).toHaveBeenCalledTimes(2);
});
it('ignores forged authors and future cursors', async () => {
  const foreign = finalizeEvent({ kind: KIND_NIP78_APP_DATA, created_at: 1, tags: [['d', CONCORD_READ_ID]], content: 'fake' }, generateSecretKey());
  hub.query.mockResolvedValue({ events: [foreign, event({ [a]: Date.now() + 999_999 })], perRelay: {} });
  await setup(); expect(useConcordReadStore.getState().cursors).toEqual({});
});
it('clears private memory and stops relay observation on disposal', async () => {
  await setup(); useConcordReadStore.getState().merge(pubkey, { [a]: 200 });
  stop(); expect(release).toHaveBeenCalled(); expect(useConcordReadStore.getState().account).toBeNull();
  useConcordReadStore.getState().merge(pubkey, { [a]: 300 });
  expect(useConcordReadStore.getState().cursors).toEqual({});
});
