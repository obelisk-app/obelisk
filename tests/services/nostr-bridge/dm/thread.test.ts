import { describe, expect, it, vi } from 'vitest';
import { DmThreadModule, type IngestDmParams } from '@/services/nostr-bridge/dm/thread';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { JsDirectMessage } from '@/services/nostr-bridge/types';
import { useNotificationsStore } from '@/store/notifications';

const PEER = 'b'.repeat(64);

function setup() {
  const dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  const deps = { forgetPending: vi.fn(), ensureUserMetadata: vi.fn(), displayNameFor: vi.fn(() => 'Peer') };
  return { mod: new DmThreadModule({ dmsByPeer }, deps), dmsByPeer, deps };
}

const params = (over: Partial<IngestDmParams> = {}): IngestDmParams => ({
  id: 'm1',
  createdAt: 10,
  plaintext: 'hi',
  outgoing: false,
  counterparty: PEER,
  protocol: 'nip17',
  pq: false,
  notifyId: 'wrap1',
  ...over,
});

describe('dm/thread', () => {
  it('appends in time order, dedupes by id, and fetches the peer profile', () => {
    const { mod, dmsByPeer, deps } = setup();
    mod.ingest(params({ id: 'late', createdAt: 20 }));
    mod.ingest(params({ id: 'early', createdAt: 5 }));
    mod.ingest(params({ id: 'late', createdAt: 20 }));
    expect(dmsByPeer.get()[PEER].map((m) => m.id)).toEqual(['early', 'late']);
    expect(deps.ensureUserMetadata).toHaveBeenCalledWith(PEER);
  });

  it('replaces our own placeholder in place and drops its retry arguments', () => {
    const { mod, dmsByPeer, deps } = setup();
    dmsByPeer.set({
      [PEER]: [{ id: 'pending:t1', counterparty: PEER, outgoing: true, content: 'hi', createdAt: 10, pending: true, clientTag: 't1' }],
    });
    mod.ingest(params({ id: 'real', outgoing: true }));
    expect(dmsByPeer.get()[PEER]).toEqual([expect.objectContaining({ id: 'real', outgoing: true })]);
    expect(deps.forgetPending).toHaveBeenCalledWith('t1');
  });

  it('raises a card for a new incoming message and never for our own', () => {
    const { mod, deps } = setup();
    const push = vi.spyOn(useNotificationsStore.getState(), 'pushDmNotification');
    mod.ingest(params({ id: 'out', outgoing: true }));
    expect(push).not.toHaveBeenCalled();
    mod.ingest(params({ id: 'in', notifyId: 'wrap-in' }));
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ id: 'wrap-in', senderPubkey: PEER, preview: 'hi' }));
    push.mockRestore();
    expect(deps.displayNameFor).toHaveBeenCalled();
  });
});
