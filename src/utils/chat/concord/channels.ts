import type { ChannelMetadata } from '@applesauce/concord';

export function groupConcordChannels<T extends ChannelMetadata>(channels: T[]) {
  const groups = new Map<string, T[]>();
  for (const channel of channels) {
    const extension = channel.custom?.obelisk;
    const name = extension && typeof extension === 'object' && 'category' in extension && typeof extension.category === 'string' ? extension.category : '';
    const rows = groups.get(name) ?? [];
    rows.push(channel);
    groups.set(name, rows);
  }
  return [...groups].map(([name, channels]) => ({ name, channels }));
}
