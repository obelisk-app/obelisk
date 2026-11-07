import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { MessageSend } from '@/services/nostr-bridge/groups/message/send';
import { MessagesState } from '@/services/nostr-bridge/groups/message/state';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import type { MessagesContext, MessagesDeps } from '@/services/nostr-bridge/groups/message/module';

function setup() {
  const state = new MessagesState();
  const session = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec' as const, relayUrl: 'wss://a.example' };
  let deleted = false;
  const ctx = {
    currentRelayUrl: new StateStore(session.relayUrl), session: () => session, signAndPublish: vi.fn(),
  } as unknown as MessagesContext;
  const deps = {
    isGroupDeleted: () => deleted, pings: { recordRelayUse: vi.fn() }, ensureUserMetadata: vi.fn(),
  } as unknown as MessagesDeps;
  return { state, ctx, send: new MessageSend(state, ctx, deps), deleteGroup: () => { deleted = true; } };
}
const event: NostrEvent = { id: 'accepted', pubkey: 'a'.repeat(64), kind: 9, content: 'hello', tags: [], created_at: 1, sig: '' };

describe('channel send lifecycle', () => {
  it('blocks sends and retries to a known deleted channel before signing', async () => {
    const { send, state, ctx, deleteGroup } = setup();
    deleteGroup();
    await expect(send.sendMessage('room', 'hello')).rejects.toMatchObject({ code: 'group-deleted' });
    await expect(send.retry('room', 'tag')).rejects.toMatchObject({ code: 'group-deleted' });
    expect(ctx.signAndPublish).not.toHaveBeenCalled();
    expect(state.messagesByGroup.get()).toEqual({});
  });

  it('rejects a signer completion after A -> B -> A and never restores the old optimistic message', async () => {
    const { send, state, ctx } = setup();
    let resolve!: (ev: NostrEvent) => void;
    vi.mocked(ctx.signAndPublish).mockReturnValue(new Promise((done) => { resolve = done; }));
    await send.sendMessage('room', 'hello');
    const assertCurrent = vi.mocked(ctx.signAndPublish).mock.calls[0][2]?.assertCurrent;
    expect(assertCurrent).toBeTypeOf('function');
    state.pendingSends.clear();
    state.messagesByGroup.set({});
    ctx.currentRelayUrl.set('wss://b.example');
    ctx.currentRelayUrl.set('wss://a.example');
    expect(assertCurrent).toThrow();
    resolve(event);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.messagesByGroup.get()).toEqual({});
  });

  it('marks a refused publish as failed rather than sent', async () => {
    const { send, state, ctx } = setup();
    vi.mocked(ctx.signAndPublish).mockRejectedValue(new Error('restricted: channel deleted'));
    await send.sendMessage('room', 'hello');
    await Promise.resolve();
    expect(state.messagesByGroup.get().room).toEqual([expect.objectContaining({ pending: false, failed: true })]);
  });
});
