import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordMessageForm } from '@/services/chat/concord/message-form';

export function useConcordComposer(community: ConcordCommunity, channelId: string) {
  const form = useForm(concordMessageForm(community, channelId, () => form.reset()));
  return { ...form, attach: (files: FileList | null) => form.set('files', files ? [...files] : []) };
}
