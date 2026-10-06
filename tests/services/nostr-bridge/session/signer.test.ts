import { describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { bytesToHex } from '@/services/nostr-bridge/hex';
import { SessionSigner } from '@/services/nostr-bridge/session/signer';
import { BUNKER_AUTH_SIGNATURE_TIMEOUT_MS, type BunkerRunOpts, type RemoteSigner } from '@/services/nostr-bridge/session/bunker';
import { buildNipSigner } from '@/services/nostr-bridge/session/nip-signer';
import { buildDmSigner } from '@/services/nostr-bridge/session/dm-signer';
import type { PersistedSession } from '@/services/nostr-bridge/session-storage';

const sk = generateSecretKey();
const pk = getPublicKey(sk);
const nsec: PersistedSession = { pubKeyHex: pk, privKeyHex: bytesToHex(sk), loginMethod: 'nsec', relayUrl: 'wss://r.example' };
const bunker = { run: vi.fn() };

describe('session/signer', () => {
  it('signs a template and an AUTH event locally for an nsec session, never touching the bunker', async () => {
    const signer = new SessionSigner({ session: () => nsec }, bunker);
    const ev = await signer.signEventTemplate({ kind: 24242, content: 'upload', tags: [['t', 'upload']] });
    expect(ev.pubkey).toBe(pk);
    expect(verifyEvent(ev)).toBe(true);
    const auth = await signer.signSessionAuth({ kind: 22242, content: '', tags: [['challenge', 'c']], created_at: 1 });
    expect(verifyEvent(auth)).toBe(true);
    expect(bunker.run).not.toHaveBeenCalled();
  });

  it('offers no AUTH signer and refuses to sign while logged out', async () => {
    const signer = new SessionSigner({ session: () => null }, bunker);
    expect(signer.getAuthSigner()).toBeUndefined();
    await expect(signer.signEventTemplate({ kind: 1, content: '', tags: [] })).rejects.toThrow(/Not logged in/);
    await expect(signer.signSessionAuth({ kind: 22242, content: '', tags: [], created_at: 1 })).rejects.toThrow(/Not logged in/);
    expect(new SessionSigner({ session: () => nsec }, bunker).getAuthSigner()).toBeTypeOf('function');
  });

  it('routes a bunker session through the serialized runner with the AUTH deadline', async () => {
    const remote: RemoteSigner = {
      getPublicKey: vi.fn(async () => pk),
      signEvent: vi.fn(async (t) => finalizeEvent(t, sk)),
      nip04Encrypt: vi.fn(),
      nip04Decrypt: vi.fn(),
      nip44Encrypt: vi.fn(),
      nip44Decrypt: vi.fn(),
      close: vi.fn(),
    };
    const seen: Array<BunkerRunOpts | undefined> = [];
    const run = <T,>(operation: (signer: RemoteSigner) => Promise<T>, opts?: BunkerRunOpts): Promise<T> => {
      seen.push(opts);
      return operation(remote);
    };
    const session: PersistedSession = { pubKeyHex: pk, loginMethod: 'bunker', relayUrl: 'wss://r.example' };
    const auth = await new SessionSigner({ session: () => session }, { run }).signSessionAuth({ kind: 22242, content: '', tags: [], created_at: 1 });
    expect(verifyEvent(auth)).toBe(true);
    expect(remote.signEvent).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([expect.objectContaining({ label: 'nip42-auth', deadlineMs: BUNKER_AUTH_SIGNATURE_TIMEOUT_MS })]);
  });
});

describe('session/nip-signer and session/dm-signer', () => {
  it('are null while logged out', () => {
    expect(buildNipSigner(null, bunker)).toBeNull();
    expect(buildDmSigner(null, { bunker, encryptNip04: vi.fn(), decryptNip04: vi.fn() })).toBeNull();
  });

  it('round-trip NIP-44 locally for an nsec session', async () => {
    const peerSk = generateSecretKey();
    const peerPk = getPublicKey(peerSk);
    const nip = buildNipSigner(nsec, bunker)!;
    expect(nip.pubkey).toBe(pk);
    const cipher = await nip.nip44Encrypt(peerPk, 'hello');
    expect(nip44.decrypt(cipher, nip44.utils.getConversationKey(peerSk, pk))).toBe('hello');
    const dm = buildDmSigner(nsec, { bunker, encryptNip04: vi.fn(), decryptNip04: vi.fn() })!;
    expect(await dm.getPublicKey()).toBe(pk);
    expect(await dm.nip44Decrypt!(peerPk, cipher)).toBe('hello');
  });

  it('records whether a decrypted ciphertext was a post-quantum envelope, and refuses pq for nsec', async () => {
    const peerPk = getPublicKey(generateSecretKey());
    const track = { current: true };
    const dm = buildDmSigner(nsec, { bunker, encryptNip04: vi.fn(), decryptNip04: vi.fn() }, track)!;
    const cipher = await dm.nip44Encrypt!(peerPk, 'x');
    await dm.nip44Decrypt!(peerPk, cipher).catch(() => undefined);
    expect(track.current).toBe(false);
    await expect(dm.nip44Encrypt!(peerPk, 'x', { scheme: 'pq', recipientKemKey: 'k' })).rejects.toThrow(/Post-quantum/);
  });

  it('sends the DM signer NIP-04 calls through the injected crypto with its lane', async () => {
    const encryptNip04 = vi.fn(async () => 'c');
    const decryptNip04 = vi.fn(async () => 'p');
    const dm = buildDmSigner(nsec, { bunker, encryptNip04, decryptNip04 }, undefined, 'background')!;
    await dm.nip04Encrypt!('peer', 'p');
    await dm.nip04Decrypt!('peer', 'c');
    expect(encryptNip04).toHaveBeenCalledWith('peer', 'p', 'background');
    expect(decryptNip04).toHaveBeenCalledWith('peer', 'c', 'background');
  });
});
