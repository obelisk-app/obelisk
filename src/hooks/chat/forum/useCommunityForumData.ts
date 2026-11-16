import { useChildrenByParent, useGroupMetadataEose, useGroups, useMessagesByGroup } from '@/services/nostr-bridge';
import { useChannelProtocol } from '@/hooks/chat/channel/useChannelProtocol';
export function useCommunityForumData() {
  const protocol = useChannelProtocol();
  const groups = useGroups();
  const childrenByParent = useChildrenByParent();
  const groupMetadataEose = useGroupMetadataEose();
  const messagesByGroup = useMessagesByGroup();
  return protocol?.forum ? { ...protocol.forum, groupMetadataEose: true } : { groups, childrenByParent, groupMetadataEose, messagesByGroup };
}
