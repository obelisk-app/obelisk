import { useCreateChannelForm } from '@/hooks/chat/channel/useCreateChannelForm';

/**
 * The phone new-channel sheet: the shared create-channel form, which on
 * success hands the new channel on and closes the sheet.
 */
export function useCreateChannelSheet(onCreated: (groupId: string) => void, close: () => void) {
  return useCreateChannelForm((id) => {
    onCreated(id);
    close();
  });
}
