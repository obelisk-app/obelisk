import { useForm } from '@/hooks/common/useForm';
import { createChannelForm } from '@/services/chat/channel/create-channel-form';

/**
 * The phone new-channel sheet: the common form over `createChannelForm`,
 * which on success hands the new channel on and closes the sheet.
 */
export function useCreateChannelSheet(onCreated: (groupId: string) => void, close: () => void) {
  return useForm(createChannelForm((id) => {
    onCreated(id);
    close();
  }));
}
