import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@/services/nostr-bridge/common/hex';
import { buildNipSigner } from '@/services/nostr-bridge/session/nip-signer';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { clearDecryptCache } from '@/services/nostr-bridge/cache/decrypt-cache';
import { enqueueSignerOp } from '@/services/nostr-bridge/session/signer-queue';
import type { RemoteSigner } from '@/services/nostr-bridge/session/bunker';
import type { NipSigner } from '@/types/nostr/nip-signer';

vi.mock('@/services/nostr-bridge/session/signer-queue', () => ({ enqueueSignerOp: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const template = { kind: 1, content: '', tags: [], created_at: 1 };
const invoke = {
  sign: (signer: NipSigner) => signer.signEvent(template),
  encrypt: (signer: NipSigner) => signer.nip44Encrypt('b'.repeat(64), 'plaintext'),
  decrypt: (signer: NipSigner) => signer.nip44Decrypt('b'.repeat(64), 'ciphertext'),
};

beforeEach(() => { clearDecryptCache(); vi.clearAllMocks(); });

describe('retained NIP signer adapters', () => {
  it.each(['sign', 'encrypt', 'decrypt'] as const)('refuses stale nsec %s before touching retained credentials', async (operation) => {
    const state = new SessionState();
    const secret = generateSecretKey();
    state.session = { pubKeyHex: getPublicKey(secret), privKeyHex: bytesToHex(secret), loginMethod: 'nsec', relayUrl: 'wss://relay.example.com' };
    const generation = state.sessionGeneration;
    const signer = buildNipSigner(state.session, { run: vi.fn() }, 'interactive', () => state.assertSessionOperation(generation))!;
    state.beginSessionOperation();
    await expect(invoke[operation](signer)).rejects.toMatchObject({ name: 'AbortError' });
  });

  for (const method of ['nip07', 'bunker'] as const) {
    it.each(['sign', 'encrypt', 'decrypt'] as const)(`rejects queued ${method} %s before dispatch to a replacement signer`, async (operation) => {
      let current = true;
      const gate = deferred<void>();
      const call = vi.fn(async () => 'result');
      const remote = { signEvent: call, nip44Encrypt: call, nip44Decrypt: call } as unknown as RemoteSigner;
      Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent: call, nip44: { encrypt: call, decrypt: call } } });
      vi.mocked(enqueueSignerOp).mockImplementation((_lane, _label, run) => gate.promise.then(run));
      const bunker = { run: <T,>(run: (remote: RemoteSigner) => Promise<T>) => gate.promise.then(() => run(remote)) };
      const signer = buildNipSigner({ pubKeyHex: 'a'.repeat(64), loginMethod: method, relayUrl: 'wss://relay.example.com' }, bunker, 'interactive', () => {
        if (!current) throw new DOMException('Replaced', 'AbortError');
      })!;
      const pending = invoke[operation](signer);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      current = false;
      gate.resolve();
      await rejected;
      expect(call).not.toHaveBeenCalled();
    });

    it.each(['sign', 'encrypt', 'decrypt'] as const)(`discards ${method} %s results returned after replacement`, async (operation) => {
      let current = true;
      const response = deferred<string>();
      const call = vi.fn(() => response.promise);
      const remote = { signEvent: call, nip44Encrypt: call, nip44Decrypt: call } as unknown as RemoteSigner;
      Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent: call, nip44: { encrypt: call, decrypt: call } } });
      vi.mocked(enqueueSignerOp).mockImplementation((_lane, _label, run) => run());
      const bunker = { run: <T,>(run: (remote: RemoteSigner) => Promise<T>) => run(remote) };
      const signer = buildNipSigner({ pubKeyHex: 'a'.repeat(64), loginMethod: method, relayUrl: 'wss://relay.example.com' }, bunker, 'interactive', () => {
        if (!current) throw new DOMException('Replaced', 'AbortError');
      })!;
      const pending = invoke[operation](signer);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(call).toHaveBeenCalledOnce();
      current = false;
      response.resolve('old result');
      await rejected;
    });
  }

  it('does not return a cached plaintext through a retired adapter', async () => {
    let current = true;
    const call = vi.fn(async () => 'plaintext');
    Object.defineProperty(window, 'nostr', { configurable: true, value: { nip44: { decrypt: call } } });
    vi.mocked(enqueueSignerOp).mockImplementation((_lane, _label, run) => run());
    const signer = buildNipSigner({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }, { run: vi.fn() }, 'interactive', () => {
      if (!current) throw new DOMException('Replaced', 'AbortError');
    })!;
    expect(await invoke.decrypt(signer)).toBe('plaintext');
    current = false;
    await expect(invoke.decrypt(signer)).rejects.toMatchObject({ name: 'AbortError' });
    expect(call).toHaveBeenCalledOnce();
  });
  it('a fresh account adapter never receives the outgoing account cache entry', async () => {
    const state = new SessionState();
    state.session = { pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' };
    const call = vi.fn().mockResolvedValueOnce('first account plaintext').mockResolvedValueOnce('second account plaintext');
    Object.defineProperty(window, 'nostr', { configurable: true, value: { nip44: { decrypt: call } } });
    vi.mocked(enqueueSignerOp).mockImplementation((_lane, _label, run) => run());
    const first = buildNipSigner(state.session, { run: vi.fn() }, 'interactive', state.captureSessionGuard())!;
    expect(await invoke.decrypt(first)).toBe('first account plaintext');
    state.beginSessionOperation();
    state.session = { ...state.session, pubKeyHex: 'c'.repeat(64) };
    const second = buildNipSigner(state.session, { run: vi.fn() }, 'interactive', state.captureSessionGuard())!;
    expect(await invoke.decrypt(second)).toBe('second account plaintext');
    expect(call).toHaveBeenCalledTimes(2);
  });

});
