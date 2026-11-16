import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordChannelEditForm } from '@/services/chat/concord/channel-form';
import { concordParentOptions } from '@/utils/chat/concord/channels';
export function useConcordChannelEdit(community: ConcordCommunity, channelId: string, name: string, onSaved: () => void) {
  const form = useForm(concordChannelEditForm(community, channelId, name, onSaved));
  return { form, parents: concordParentOptions(community.state$.value.channels, channelId), setPublication: (value: boolean) => form.set('publication', value) };
}
