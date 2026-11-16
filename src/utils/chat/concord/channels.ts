import type { ChannelMetadata } from '@applesauce/concord';

export function concordChannelLayout(channel: ChannelMetadata | undefined) {
  const extension = channel?.custom?.obelisk;
  const data = extension && typeof extension === 'object' ? extension as Record<string, unknown> : {};
  return { category: typeof data.category === 'string' ? data.category : '', position: typeof data.position === 'number' && Number.isSafeInteger(data.position) && data.position >= 0 ? data.position : 0 };
}

export function groupConcordChannels<T extends ChannelMetadata>(channels: T[]) {
  const groups = new Map<string, T[]>();
  for (const channel of [...channels].sort((a, b) => concordChannelLayout(a).position - concordChannelLayout(b).position || a.name.localeCompare(b.name))) {
    const extension = channel.custom?.obelisk;
    const name = extension && typeof extension === 'object' && 'category' in extension && typeof extension.category === 'string' ? extension.category : '';
    const rows = groups.get(name) ?? [];
    rows.push(channel);
    groups.set(name, rows);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, channels]) => ({ name, channels }));
}
