import type { ChannelMetadata, Rumor } from '@applesauce/concord';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

export function concordGroup(communityId: string, channel: ChannelMetadata): JsGroup {
  return { id: `concord:${communityId}:${channel.channel_id}`, name: channel.name, about: null, picture: null, banner: null,
    isPublic: !channel.private, isHidden: false, isRestricted: false, isOpen: true, parent: null,
    kind: channel.view === 'forum' ? 'forum' : 'text', forumTags: [], topics: [] };
}
export function concordMessage(row: { rumor: Rumor; content: string; subject?: string }): JsMessage {
  return { id: row.rumor.id, pubkey: row.rumor.pubkey, content: row.subject ? `${row.subject}\n\n${row.content}` : row.content,
    createdAt: row.rumor.created_at, kind: row.rumor.kind,
    replyToId: row.rumor.tags.find(tag => tag[0] === 'q')?.[1] ?? row.rumor.tags.find(tag => tag[0] === 'e' && (tag[3] === 'reply' || row.rumor.kind === 1111))?.[1] ?? null,
    mentions: row.rumor.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]) };
}

/** Hide a relay echo while its matching optimistic row is still awaiting acknowledgements. */
export function mergeConcordPending(messages: JsMessage[], pending: ReadonlyArray<{ rumorId?: string; message: JsMessage; channelId: string; thread?: { id: string } }>, channelId: string | undefined, threadId?: string | null) {
  const active = pending.filter(row => row.channelId === channelId && (row.thread?.id ?? null) === (threadId ?? null));
  const echoes = new Set(active.map(row => row.rumorId).filter(Boolean));
  return [...messages.filter(message => !echoes.has(message.id)), ...active.map(row => row.message)];
}
