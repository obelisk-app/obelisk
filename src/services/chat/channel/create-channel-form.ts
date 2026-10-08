import { nostrActions } from '@/services/nostr-bridge';
import type { FormSpec } from '@/constants/common/form';
import { filled } from '@/utils/common/form-rules';

export type CreateChannelValues = { name: string };

/**
 * The new-channel form (the desktop sidebar's inline section and the phone's
 * sheet). Just the name: the relay decides who may publish kind 9007, so the
 * form is not gated by role and a refused publish shows as the form's error.
 * Publishes a public, open channel under the trimmed name, clears the field,
 * then hands the new id to `onCreated`.
 */
export function createChannelForm(onCreated: (groupId: string) => void): FormSpec<CreateChannelValues, string> {
  return {
    initial: { name: '' },
    ready: (values) => filled(values.name),
    submit: (values) => nostrActions.createGroup({ name: values.name.trim(), isPublic: true, isOpen: true }),
    failure: 'shell.channel.createFailed',
    resetOnSuccess: true,
    onSuccess: (groupId) => onCreated(groupId),
  };
}
