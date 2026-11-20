import { expect, it, vi } from 'vitest';
import { cachedConcordAccountRelays } from '@/services/nostr-bridge/concord/account-relays';

it('uses the sealed relay cache before network discovery finishes and saves the refresh', async () => {
  const cached = ['wss://old.example'];
  const fresh = ['wss://new.example'];
  const storage = { getItem: vi.fn().mockResolvedValue(JSON.stringify(cached)), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn() };
  let resolve!: (relays: string[]) => void;
  const discovery = new Promise<string[]>(done => { resolve = done; });
  await expect(cachedConcordAccountRelays(storage, () => discovery)).resolves.toEqual(cached);
  resolve(fresh);
  await discovery;
  expect(storage.setItem).toHaveBeenCalledWith('obelisk/account-relays', JSON.stringify(fresh));
});

it('uses discovery when the sealed cache has no valid entry', async () => {
  const fresh = ['wss://new.example'];
  const storage = { getItem: vi.fn().mockResolvedValue('["ws://localhost"]'), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn() };
  await expect(cachedConcordAccountRelays(storage, async () => fresh)).resolves.toEqual(fresh);
});
