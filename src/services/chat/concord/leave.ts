import type { ConcordClient, ConcordCommunity } from '@applesauce/concord/client';
import type { Translate } from '@/i18n/keys';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { useConcordNavigation } from '@/store/chat/concord';
import { useToastStore } from '@/store/feedback/toast';
import { errorText } from '@/utils/errors/error-text';
import { disposeConcordOutbox } from './outbox';

export async function confirmAndLeaveConcord(client: ConcordClient, community: ConcordCommunity, name: string, t: Translate) {
  if (!await confirmDialog({ title: t('chat.concord.leaveTitle', { name }), message: t('chat.concord.leaveBody'),
    confirmLabel: t('chat.concord.leave'), icon: 'leave' })) return;
  try {
    await client.leave(community.communityId);
    disposeConcordOutbox(community);
    if (useConcordNavigation.getState().communityId === community.communityId) {
      useConcordNavigation.setState({ open: false, communityId: null, channelId: null, threadId: null });
    }
  } catch (error) {
    useToastStore.getState().pushToast({ title: t('chat.concord.failed'), body: errorText(t, error, 'chat.concord.failed') });
  }
}
