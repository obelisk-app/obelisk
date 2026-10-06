import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils.js';

const loginWithNip07 = vi.fn(async () => {});
const loginWithNsec = vi.fn(async () => {});
const loginWithBunker = vi.fn(async () => {});
vi.mock('@/services/nostr-bridge', () => ({
  nostrActions: {
    loginWithNip07: (...a: unknown[]) => loginWithNip07(...(a as [])),
    loginWithNsec: (...a: unknown[]) => loginWithNsec(...(a as [])),
    loginWithBunker: (...a: unknown[]) => loginWithBunker(...(a as [])),
  },
}));
vi.mock('@/utils/identity/display-name', () => ({ randomProfileName: () => 'Random' }));

import { routeToBridge } from '@/services/login/login-bridge';

describe('routeToBridge', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends an extension login to loginWithNip07', async () => {
    await routeToBridge({ method: 'nip07', pubkey: 'a'.repeat(64) });
    expect(loginWithNip07).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('turns an nsec into the hex pair loginWithNsec expects', async () => {
    const sk = generateSecretKey();
    await routeToBridge({ method: 'import', pubkey: 'ignored', nsec: nip19.nsecEncode(sk) });
    expect(loginWithNsec).toHaveBeenCalledWith(bytesToHex(sk), getPublicKey(sk));
  });

  it('refuses an nsec login with no nsec, and a bunker login without its URI or paired signer', async () => {
    await expect(routeToBridge({ method: 'generate', pubkey: 'p' })).rejects.toThrow(/nsec/);
    await expect(routeToBridge({ method: 'nip46', pubkey: 'p', signer: {} })).rejects.toThrow(/bunker URI/);
    await expect(routeToBridge({ method: 'nip46', pubkey: 'p', bunkerUri: 'bunker://x' })).rejects.toThrow(/paired remote signer/);
    expect(loginWithBunker).not.toHaveBeenCalled();
  });

  it('reuses the client key the SDK paired with', async () => {
    const client = generateSecretKey();
    const signer = { id: 'paired' };
    await routeToBridge({ method: 'nip46', pubkey: 'p', bunkerUri: 'bunker://x', clientNsec: nip19.nsecEncode(client), signer });
    expect(loginWithBunker).toHaveBeenCalledWith('bunker://x', { clientSecretHex: bytesToHex(client), signer });
  });
});
