import type { ChannelMetadata } from '@applesauce/concord';

export function concordChannelLayout(channel: ChannelMetadata | undefined) {
  const extension = channel?.custom?.obelisk;
  const data = extension && typeof extension === 'object' ? extension as Record<string, unknown> : {};
  return { parent: typeof data.parent === 'string' ? data.parent : '', category: typeof data.category === 'string' ? data.category : '', position: typeof data.position === 'number' && Number.isSafeInteger(data.position) && data.position >= 0 ? data.position : 0 };
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

/** Treat missing parents and cycles as roots, so imported metadata cannot recurse the UI forever. */
export function concordChannelParents(channels: ChannelMetadata[]) {
  const byId = new Map(channels.map(channel => [channel.channel_id, channel]));
  const result = new Map<string, string>();
  for (const channel of channels) {
    let parent = concordChannelLayout(channel).parent;
    const direct = parent, seen = new Set([channel.channel_id]);
    let valid = true;
    while (parent) {
      if (seen.has(parent) || !byId.has(parent)) { valid = false; break; }
      seen.add(parent);
      parent = concordChannelLayout(byId.get(parent)).parent;
    }
    if (valid && direct) result.set(channel.channel_id, direct);
  }
  return result;
}
export function concordParentOptions(channels: ChannelMetadata[], currentId?: string) {
  return channels.filter(channel => {
    const seen = new Set<string>();
    let cursor: ChannelMetadata | undefined = channel;
    while (cursor) {
      if (cursor.channel_id === currentId || seen.has(cursor.channel_id)) return false;
      seen.add(cursor.channel_id);
      const parent: string = concordChannelLayout(cursor).parent;
      cursor = parent ? channels.find(item => item.channel_id === parent) : undefined;
    }
    return true;
  });
}
