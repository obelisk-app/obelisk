import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { RelayAccessState } from '../common/types';
import { useSubscription } from './subscription';

export function useConnectionState(): string {
  return useSubscription((b, cb) => b.subscribeConnectionState(cb), 'Disconnected');
}

export function useCurrentRelayUrl(): string {
  return useSubscription((b, cb) => b.subscribeCurrentRelayUrl(cb), '');
}

export function useRelayAccess(url?: string | null): RelayAccessState {
  const current = useCurrentRelayUrl();
  const target = (url ?? current) || '';
  const map = useSubscription<Readonly<Record<string, RelayAccessState>>>(
    (b, cb) => b.subscribeRelayAccess(cb),
    {},
  );
  if (!target) return 'unknown';
  return map[normalizeRelayUrl(target)] ?? 'unknown';
}

export function useConfiguredRelays(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeConfiguredRelays(cb), []);
}
