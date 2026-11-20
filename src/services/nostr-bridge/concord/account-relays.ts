import type { ConcordStorage } from '@applesauce/concord/client';
import { isImportableRelayUrl, uniqueRelayUrls } from '../relay/relay-list';

const storageKey = 'obelisk/account-relays';

/** Read the account's sealed routing cache before asking the network. */
export async function cachedConcordAccountRelays(storage: ConcordStorage, discover: () => Promise<string[]>): Promise<string[]> {
  const cached = await storage.getItem(storageKey).then(raw => {
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(value => typeof value === 'string' && isImportableRelayUrl(value))
      ? uniqueRelayUrls(parsed).slice(0, 10)
      : null;
  }).catch(() => null);
  const fresh = discover().then(relays => {
    void storage.setItem(storageKey, JSON.stringify(relays)).catch(() => {});
    return relays;
  });
  if (!cached) return fresh;
  void fresh.catch(() => {});
  return cached;
}
