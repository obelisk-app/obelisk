import type { ConcordCommunity } from '@applesauce/concord/client';
import { shortHost } from '@/utils/relay-url/url-host';

export function communityRailEntries(relays: readonly string[], communities: readonly ConcordCommunity[]) {
  return [
    ...relays.map(url => ({ kind: 'relay' as const, key: url, label: shortHost(url), url })),
    ...communities.map(community => ({ kind: 'concord' as const, key: community.communityId,
      label: community.state$.value.metadata?.name ?? community.material.name, community })),
  ].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}
