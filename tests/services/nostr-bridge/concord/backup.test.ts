// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { openConcordStorage } from '@/services/nostr-bridge/concord/storage';
import { openConcordBackup, sealConcordBackup } from '@/services/nostr-bridge/concord/backup';

function identity() {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  return {
    pubkey,
    nip44Encrypt: async (recipient: string, value: string) => nip44.encrypt(value, nip44.getConversationKey(secret, recipient)),
    nip44Decrypt: async (sender: string, value: string) => nip44.decrypt(value, nip44.getConversationKey(secret, sender)),
  };
}

it('restores encrypted history and membership under the same identity on a fresh device', async () => {
  const signer = identity();
  vi.stubGlobal('indexedDB', new IDBFactory());
  try {
    const source = await openConcordStorage(signer.pubkey, () => {});
    const history = 'History from a different community member';
    await source.setItem('rumors', history);
    await source.setItem('membership', 'portable key record');
    const archive = await sealConcordBackup(signer, await source.snapshot());
    expect(archive).not.toContain(history);
    expect(archive).not.toContain('portable key record');
    const file = new File([archive], 'concord.json');
    await expect(openConcordBackup(identity(), file)).rejects.toThrow('Invalid Concord backup');
    const tampered = JSON.parse(archive);
    tampered.ciphertext = (tampered.ciphertext.startsWith('A') ? 'B' : 'A') + tampered.ciphertext.slice(1);
    await expect(openConcordBackup(signer, new File([JSON.stringify(tampered)], 'tampered.json'))).rejects.toThrow();

    vi.stubGlobal('indexedDB', new IDBFactory());
    const target = await openConcordStorage(signer.pubkey, () => {});
    const other = await openConcordStorage(identity().pubkey, () => {});
    await other.setItem('rumors', 'other account history');
    await target.setItem('stale', 'old cache');
    await target.stageRestore(await openConcordBackup(signer, file));
    expect(await target.getItem('rumors')).toBeNull();
    await target.applyRestore();
    expect(await target.getItem('rumors')).toBe(history);
    expect(await target.getItem('membership')).toBe('portable key record');
    expect(await target.getItem('stale')).toBeNull();
    expect(await other.getItem('rumors')).toBe('other account history');
    await target.setItem('rumors', 'new history');
    await target.applyRestore();
    expect(await target.getItem('rumors')).toBe('new history');
  } finally { vi.unstubAllGlobals(); }
});
