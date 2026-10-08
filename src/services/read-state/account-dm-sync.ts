import { fetchRelayList } from '@nostr-wot/data';
import { DEFAULT_PROFILE_LOOKUP_RELAYS } from '@/services/nostr-bridge';
import { leasedRelays } from '@/services/social/pool';
import { startDMRelaySync } from './relay-sync';

/**
 * Resolve this account's NIP-65 relays and sync its DM cursors there.
 * The lookup uses leased configured relays plus public lookup relays;
 * configured relays the reader is not browsing receive no lookup traffic.
 * Cleanup owns both the pending lookup and the resulting subscription.
 */
export function startAccountDmSync(
  pubkey: string,
  configuredRelays: readonly string[],
  activeRelay: string,
): () => void {
  let cancelled = false;
  let stop: (() => void) | undefined;
  const searchRelays = [...new Set([...leasedRelays(configuredRelays), ...DEFAULT_PROFILE_LOOKUP_RELAYS])];
  void fetchRelayList(pubkey, searchRelays).catch(() => null).then((list) => {
    if (cancelled) return;
    const found = list ? [...new Set([...list.read, ...list.write])] : [];
    const targets = found.length > 0 ? found : (activeRelay ? [activeRelay] : []);
    if (targets.length > 0) stop = startDMRelaySync(targets);
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}
