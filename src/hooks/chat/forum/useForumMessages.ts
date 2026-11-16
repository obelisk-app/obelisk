import { useMessages, useMessagesStatus } from '@/services/nostr-bridge';
import { useChannelProtocol } from '@/hooks/chat/channel/useChannelProtocol';
export function useForumMessages(groupId: string) {
  const protocol = useChannelProtocol();
  const messages = useMessages(protocol ? null : groupId);
  const messagesStatus = useMessagesStatus(protocol ? null : groupId);
  return protocol?.forum ? { messages: protocol.forum.messagesByGroup[groupId] ?? [], messagesStatus: 'empty-confirmed' as const } : { messages, messagesStatus };
}
