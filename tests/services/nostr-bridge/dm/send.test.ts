import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmSendModule, resolveDmProtocol, type DmSend, type DmSendDeps } from '@/services/nostr-bridge/dm/send';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import type { PersistedSession } from '@/services/nostr-bridge/session/session-storage';
import type { JsDirectMessage } from '@/services/nostr-bridge/common/types';
import { useDMStore } from '@/store/chat/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);
const FILE: JsDmFile = { url: 'https://b.example/x', mimeType: 'image/png', algorithm: 'aes-gcm', key: 'k', nonce: 'n', x: 'x' };
const session: PersistedSession = { pubKeyHex: ME, loginMethod: 'nsec', relayUrl: 'wss://r.example', privKeyHex: '1'.repeat(64) };

function setup(over: Partial<DmSendDeps> = {}) {
  const dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  const sends: Array<{ protocol: 'nip04' | 'nip17'; send: DmSend }> = [];
  const deps: DmSendDeps = {
    publishNip04: async (send) => { sends.push({ protocol: 'nip04', send }); },
    publishNip17: async (send) => { sends.push({ protocol: 'nip17', send }); },
    ensureUserMetadata: vi.fn(),
    ...over,
  };
  const mod = new DmSendModule({ session: () => session, dmsByPeer }, deps);
  return { mod, dmsByPeer, sends, deps };
}

afterEach(() => {
  useDMStore.setState({ protocolOverrides: {} });
});

describe('dm/send', () => {
  it('defaults to NIP-17 and honours a per-thread NIP-04 pin', () => {
    expect(resolveDmProtocol(PEER)).toBe('nip17');
    useDMStore.getState().setProtocolOverride(PEER, 'nip04');
    expect(resolveDmProtocol(PEER)).toBe('nip04');
  });

  it('paints a pending placeholder and hands the attempt to the thread protocol', async () => {
    const { mod, dmsByPeer, sends } = setup();
    await mod.sendDirectMessage(PEER, 'hello', [['emoji', 'x', 'https://e.example/x.png']]);
    const [pending] = dmsByPeer.get()[PEER];
    expect(pending).toMatchObject({ outgoing: true, content: 'hello', pending: true, protocol: 'nip17', pq: false });
    expect(sends).toHaveLength(1);
    expect(sends[0].protocol).toBe('nip17');
    expect(sends[0].send).toMatchObject({ recipientPubkey: PEER, content: 'hello', clientTag: pending.clientTag });
    expect(sends[0].send.extraTags).toEqual([['emoji', 'x', 'https://e.example/x.png']]);
  });

  it('drops the tags on a NIP-04 thread, where they would travel in the clear', async () => {
    useDMStore.getState().setProtocolOverride(PEER, 'nip04');
    const { mod, sends } = setup();
    await mod.sendDirectMessage(PEER, 'hello', [['sticker', 'x']]);
    expect(sends[0].protocol).toBe('nip04');
    expect(sends[0].send.extraTags).toEqual([]);
  });

  it('refuses a file on a NIP-04 thread before painting anything', async () => {
    useDMStore.getState().setProtocolOverride(PEER, 'nip04');
    const { mod, dmsByPeer, sends } = setup();
    await expect(mod.sendDirectFile(PEER, FILE)).rejects.toThrow(/NIP-17/);
    expect(dmsByPeer.get()).toEqual({});
    expect(sends).toHaveLength(0);
  });

  it('retries only a failed send, with the original arguments, and cancel removes it', async () => {
    const { mod, dmsByPeer, sends } = setup();
    await mod.sendDirectMessage(PEER, 'hello');
    const tag = dmsByPeer.get()[PEER][0].clientTag!;
    await mod.retry(PEER, tag);
    expect(sends).toHaveLength(1);
    mod.markFailed(PEER, tag);
    expect(dmsByPeer.get()[PEER][0]).toMatchObject({ pending: false, failed: true });
    await mod.retry(PEER, tag);
    expect(sends).toHaveLength(2);
    expect(sends[1].send).toEqual(sends[0].send);
    expect(dmsByPeer.get()[PEER][0]).toMatchObject({ pending: true, failed: false });
    mod.cancel(PEER, tag);
    expect(dmsByPeer.get()[PEER]).toEqual([]);
    await mod.retry(PEER, tag);
    expect(sends).toHaveLength(2);
  });

  it('replaces the placeholder with the settled message and forgets its retry arguments', async () => {
    const { mod, dmsByPeer, sends, deps } = setup();
    await mod.sendDirectMessage(PEER, 'hello');
    const tag = dmsByPeer.get()[PEER][0].clientTag!;
    mod.replacePending(PEER, tag, { id: 'rumor-id', createdAt: 5, protocol: 'nip17', pq: true }, 'hello');
    expect(dmsByPeer.get()[PEER]).toEqual([
      expect.objectContaining({ id: 'rumor-id', createdAt: 5, pq: true, outgoing: true, content: 'hello' }),
    ]);
    expect(dmsByPeer.get()[PEER][0].pending).toBeUndefined();
    expect(deps.ensureUserMetadata).toHaveBeenCalledWith(PEER);
    mod.markFailed(PEER, tag);
    await mod.retry(PEER, tag);
    expect(sends).toHaveLength(1);
  });

  it('starts the protocol send in the same tick as the placeholder', async () => {
    let started = false;
    const { mod } = setup({ publishNip17: async () => { started = true; } });
    void mod.sendDirectMessage(PEER, 'hello');
    expect(started).toBe(true);
  });
});
