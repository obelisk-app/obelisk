import { concordParentOptions } from '@/utils/chat/concord/channels';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordChannelForm } from '@/services/chat/concord/channel-form';
import { useConcordNavigation } from '@/store/chat/concord';

export function useConcordChannelForm(community: ConcordCommunity) {
  const selectChannel = useConcordNavigation(state => state.selectChannel);
  const form = useForm(concordChannelForm(community, selectChannel));
  return { form, parents: concordParentOptions(community.state$.value.channels), setPrivate: (value: boolean) => form.set('private', value), setPublication: (value: boolean) => form.set('publication', value) };
}
