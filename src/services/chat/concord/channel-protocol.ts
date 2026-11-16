import type { ConcordCommunity } from '@applesauce/concord/client';
import type { Rumor } from '@applesauce/concord';
import type { ChannelProtocol } from '@/types/chat/channel-protocol';
import { refoundAuthority, parseImeta } from '@applesauce/concord/helpers';
import { CONCORD_ATTACHMENT_BYTE_LIMIT } from '@/constants/nostr-bridge/concord';
import { PERM } from '@/constants/chat/concord';
import { downloadConcordAttachment } from './media';

export function concordChannelProtocol(community: ConcordCommunity, channelId: string, rumors: readonly Rumor[], files: Map<string, File>): ChannelProtocol {
  const find = (id: string) => { const rumor = rumors.find(row => row.id === id); if (!rumor) throw new Error('Message unavailable'); return rumor; };
  return {
    scope: `concord:${community.communityId}:${channelId}`,
    async upload(file) { if (file.size > CONCORD_ATTACHMENT_BYTE_LIMIT || files.size >= 10) throw new Error('Attachment limit exceeded'); const token = `attachment:${crypto.randomUUID()}`; files.set(token, file); return token; },
    async send(content, reply) {
      const selected = [...files].filter(([token]) => content.includes(token));
      let text = content;
      for (const [token] of selected) text = text.replaceAll(token, '');
      const result = await community.sendMessage(channelId, text.trim(), reply ? { id: reply.id, author: reply.pubkey } : undefined, selected.map(([, file]) => file));
      for (const [token] of selected) files.delete(token);
      return result;
    },
    react: (id, emoji, reactionId) => reactionId ? community.deleteMessage(channelId, find(reactionId)) : community.react(channelId, find(id), emoji),
    remove: id => community.deleteMessage(channelId, find(id)),
    canDelete: id => !community.state$.value.dissolved && (find(id).pubkey === community.pubkey || refoundAuthority(community.state$.value, PERM.MANAGE_MESSAGES, find(id).pubkey)(community.pubkey)),
    attachments: id => [...parseImeta(find(id).tags).values()],
    download: downloadConcordAttachment,
  };
}
