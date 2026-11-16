import { concordParentOptions } from '@/utils/chat/concord/channels';
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

/** Rename the selected channel without replacing its privacy or custom metadata. */
export async function setConcordChannelName(community: ConcordCommunity, channelId: string, name: string) {
  if (!name.trim()) throw new Error('Channel name is required');
  const head = await community.admin.latestEdition(channelId);
  if (!head) throw new Error('Channel metadata is not available');
  const content = JSON.parse(head.content);
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Invalid channel metadata');
  await community.admin.publishEdition(VSK.CHANNEL, channelId, JSON.stringify({
    ...content, name: name.trim(),
  }), 'channel-metadata', { expectedHead: head.hash });
}

/** Change presentation fields together under one edition guard. Other clients may ignore the extension. */
export async function editConcordChannel(community: ConcordCommunity, channelId: string, values: { name: string; category: string; position: string; parent?: string; publication?: boolean }) {
  if (!values.name.trim()) throw new Error('Channel name is required');
  const position = Number(values.position);
  if (values.parent && !concordParentOptions(community.state$.value.channels, channelId).some(channel => channel.channel_id === values.parent)) throw new Error('Invalid parent channel');
  if (!Number.isSafeInteger(position) || position < 0) throw new Error('Invalid channel position');
  const head = await community.admin.latestEdition(channelId);
  if (!head) throw new Error('Channel metadata is not available');
  const content = JSON.parse(head.content);
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Invalid channel metadata');
  const custom = content.custom && typeof content.custom === 'object' && !Array.isArray(content.custom) ? content.custom : {};
  const obelisk = custom.obelisk && typeof custom.obelisk === 'object' && !Array.isArray(custom.obelisk) ? custom.obelisk : {};
  await community.admin.publishEdition(VSK.CHANNEL, channelId, JSON.stringify({
    ...content, name: values.name.trim(), ...(values.publication === undefined ? {} : { view: values.publication ? 'forum' : 'chat' }), custom: { ...custom, obelisk: { ...obelisk, category: values.category.trim(), position, ...(values.parent === undefined ? {} : { parent: values.parent }) } },
  }), 'channel-metadata', { expectedHead: head.hash });
}
