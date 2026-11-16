import type { ChannelMetadata, Rumor } from '@applesauce/concord';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

export function concordGroup(communityId: string, channel: ChannelMetadata): JsGroup {
  return { id: `concord:${communityId}:${channel.channel_id}`, name: channel.name, about: null, picture: null, banner: null,
    isPublic: !channel.private, isHidden: false, isRestricted: false, isOpen: true, parent: null,
    kind: 'text', forumTags: [], topics: [] };
}
export function concordMessage(row: { rumor: Rumor; content: string; subject?: string }): JsMessage {
  return { id: row.rumor.id, pubkey: row.rumor.pubkey, content: row.subject ? `${row.subject}\n\n${row.content}` : row.content,
    createdAt: row.rumor.created_at, kind: row.rumor.kind,
    replyToId: row.rumor.tags.find(tag => tag[0] === 'e' && tag[3] === 'reply')?.[1] ?? null,
    mentions: row.rumor.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]) };
}
