import type { ConcordCommunity } from '@applesauce/concord/client';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import { VSK, PERM } from '@/constants/chat/concord';
import { concordCommunityLayout } from '@/utils/chat/concord/layout';
import { parseConcordLayout } from '@/schemas/chat/concord-layout';
import { awaitConcordSendReady } from './send-readiness';

/** One authenticated edition atomically saves category names, order and assignments. */
export async function publishConcordLayout(community: ConcordCommunity, layout: ChannelLayout, expected: ChannelLayout) {
  await awaitConcordSendReady(community);
  if (!community.canDo(PERM.MANAGE_METADATA)) throw new Error('Community metadata permission required');
  const prefix = `concord:${community.communityId}:`;
  if (layout.channels.some(channel => !channel.id.startsWith(prefix))) throw new Error('Invalid channel scope');
  const normalized = parseConcordLayout({ ...layout, channels: layout.channels.map(channel => ({ ...channel, id: channel.id.slice(prefix.length) })) });
  if (!normalized || normalized.categories.length !== layout.categories.length || normalized.channels.length !== layout.channels.length) throw new Error('Invalid layout');
  const head = await community.admin.latestEdition(community.communityId);
  if (!head) throw new Error('Community metadata unavailable');
  const content = JSON.parse(head.content);
  if (JSON.stringify(concordCommunityLayout({ ...community.state$.value, metadata: content })) !== JSON.stringify(expected)) throw new Error('Channel layout changed; reopen the editor');
  if (layout.categories.some(category => category.name.length > 120)) throw new Error('Category name is too long');
  const custom = content.custom ?? {};
  const obelisk = custom.obelisk && typeof custom.obelisk === 'object' ? custom.obelisk : {};
  await community.admin.publishEdition(VSK.METADATA, community.communityId, JSON.stringify({
    ...content, custom: { ...custom, obelisk: { ...obelisk, layout: normalized } },
  }), 'community-layout', { expectedHead: head.hash });
}
