import { afterEach, expect, it, vi } from 'vitest';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { SessionSigner } from '@/services/nostr-bridge/session/signer';
import { buildNipSigner } from '@/services/nostr-bridge/session/nip-signer';
import { buildDmSigner } from '@/services/nostr-bridge/session/dm-signer';
import { signForSession } from '@/services/nostr-bridge/publish/publish-sign';
import { enqueueSignerOp } from '@/services/nostr-bridge/session/signer-queue';
import type { RemoteSigner } from '@/services/nostr-bridge/session/bunker';

const template = { kind: 1, created_at: 1, content: '', tags: [] };
function session(method: 'nip07' | 'bunker' = 'nip07') {
  const state = new SessionState();
  state.session = { pubKeyHex: 'a'.repeat(64), loginMethod: method, relayUrl: 'wss://relay.example' };
  return state;
}
afterEach(() => { delete window.nostr; });

it('never falls back to the local extension after a remote signer rejection', async () => {
  const state = session('bunker');
  const local = vi.fn();
  Object.assign(window, { nostr: { signEvent: local, nip44: { encrypt: local, decrypt: local } } });
  const bunker = { run: vi.fn(async () => { throw new Error('remote unavailable'); }) };
  const nip = buildNipSigner(state.session, bunker)!;
  const dm = buildDmSigner(state.session, { bunker, encryptNip04: local, decryptNip04: local })!;
  await expect(nip.signEvent(template)).rejects.toThrow('remote unavailable');
  await expect(nip.nip44Encrypt('peer', 'secret')).rejects.toThrow('remote unavailable');
  await expect(dm.nip44Decrypt!('peer', 'cipher')).rejects.toThrow('remote unavailable');
  expect(local).not.toHaveBeenCalled();
});

it('rejects queued template, auth, publish and DM calls before touching a changed extension', async () => {
  const state = session();
  const local = vi.fn(async () => ({ ...template, pubkey: state.session!.pubKeyHex, id: '', sig: '' }));
  Object.assign(window, { nostr: { signEvent: local } });
  let release!: () => void;
  const blocking = enqueueSignerOp('interactive', 'test:block', () => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  const bunker = { run: vi.fn() };
  const capture = () => state.captureSessionGuard();
  const signer = new SessionSigner({ session: () => state.session }, bunker, capture);
  const calls = [
    signer.signEventTemplate(template),
    signer.signSessionAuth(template),
    signForSession(state.session!, { withBunkerSigner: bunker.run, onSigned: vi.fn(), captureSessionGuard: capture }, template),
    buildDmSigner(state.session, { bunker, encryptNip04: vi.fn(), decryptNip04: vi.fn() }, undefined, 'interactive', capture())!.signEvent(template),
  ];
  const settled = Promise.allSettled(calls);
  state.extensionIdentityPending = true;
  state.extensionIdentityRevision++;
  release();
  await blocking;
  expect((await settled).every((result) => result.status === 'rejected')).toBe(true);
  expect(local).not.toHaveBeenCalled();
});

it('discards a remote signature completed after a different session took over', async () => {
  const state = session('bunker');
  const remote = { signEvent: async () => {
    const pubkey = state.session!.pubKeyHex;
    state.beginSessionOperation();
    return { ...template, pubkey, id: '', sig: '' };
  } } as unknown as RemoteSigner;
  const signer = new SessionSigner({ session: () => state.session }, { run: async (operation) => operation(remote) }, () => state.captureSessionGuard());
  await expect(signer.signEventTemplate(template)).rejects.toThrow('superseded');
});
