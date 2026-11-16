import type { CommunityState } from '@applesauce/concord';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import { parseConcordLayout } from '@/schemas/chat/concord-layout';
import { concordChannelLayout, concordChannelParents } from './channels';

/** Import old per-channel category names once; a saved layout also retains empty categories. */
export function concordCommunityLayout(state: CommunityState): ChannelLayout {
  const extension = state.metadata?.custom?.obelisk as { layout?: unknown } | undefined;
  const saved = parseConcordLayout(extension?.layout);
  const prefix = `concord:${state.material.community_id}:`;
  if (saved) return { ...saved, channels: saved.channels.map(channel => ({ ...channel, id: prefix + channel.id })) };
  const categories: ChannelLayout['categories'][number][] = [];
  const byName = new Map<string, string>();
  const parents = concordChannelParents(state.channels);
  const channels = state.channels.filter(channel => !parents.has(channel.channel_id) && channel.view !== 'voice')
    .sort((a, b) => concordChannelLayout(a).position - concordChannelLayout(b).position || a.name.localeCompare(b.name))
    .map((channel, position) => {
      const { category } = concordChannelLayout(channel);
      if (category && !byName.has(category)) {
        const id = `legacy-${channel.channel_id}`;
        byName.set(category, id);
        categories.push({ id, name: category, position: categories.length });
      }
      return { id: prefix + channel.channel_id, categoryId: byName.get(category) ?? null, position };
    });
  return { categories, channels, updatedAt: 0 };
}
