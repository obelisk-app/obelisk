import type { CommunityConnections, ConnectionEntry } from '@/types/chat/community-connections';

function mergeEntries<T>(left: Record<string, ConnectionEntry<T>>, right: Record<string, ConnectionEntry<T>>) {
  const result = { ...left };
  for (const [key, incoming] of Object.entries(right)) {
    const current = result[key];
    if (!current || incoming.at > current.at || incoming.at === current.at && JSON.stringify(incoming.value) > JSON.stringify(current.value)) result[key] = incoming;
  }
  return result;
}
/** Per-entry timestamps and tombstones preserve independent edits and removals across devices. */
export function mergeCommunityConnections(left: CommunityConnections, right: CommunityConnections): CommunityConnections {
  return { version: 1, relays: mergeEntries(left.relays, right.relays), channels: mergeEntries(left.channels, right.channels) };
}

/** Stable key ordering prevents equivalent snapshots from causing republish loops. */
export function serializeCommunityConnections(doc: CommunityConnections): string {
  const sorted = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sorted);
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
  };
  return JSON.stringify(sorted(doc));
}
