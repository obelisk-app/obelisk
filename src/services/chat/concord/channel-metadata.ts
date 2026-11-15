import type { ConcordCommunity } from '@applesauce/concord/client';
import { VSK } from '@/constants/chat/concord';

/** Preserve unknown metadata and reject concurrent edits instead of overwriting them. */
export async function setConcordChannelCategory(community: ConcordCommunity, channelId: string, category: string) {
  const head = await community.admin.latestEdition(channelId);
  if (!head) throw new Error('Channel metadata is not available');
  const content = JSON.parse(head.content);
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Invalid channel metadata');
  const custom = content.custom && typeof content.custom === 'object' && !Array.isArray(content.custom) ? content.custom : {};
  const obelisk = custom.obelisk && typeof custom.obelisk === 'object' && !Array.isArray(custom.obelisk) ? custom.obelisk : {};
  await community.admin.publishEdition(VSK.CHANNEL, channelId, JSON.stringify({
    ...content, custom: { ...custom, obelisk: { ...obelisk, category: category.trim() } },
  }), 'channel-metadata', { expectedHead: head.hash });
}
