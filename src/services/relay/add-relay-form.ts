import { nostrActions } from '@/services/nostr-bridge';
import type { FormSpec } from '@/constants/common/form';
import { filled, isRelayAddress } from '@/utils/common/form-rules';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';

export type AddRelayValues = { url: string };

/** Add a relay to the rail; the custom form also switches to it, a suggestion only adds. */
async function addRelay(typed: string, andSwitch: boolean): Promise<void> {
  const url = normalizeRelayInput(typed) ?? typed;
  await nostrActions.addRelay(url);
  if (andSwitch) await nostrActions.switchRelay(url);
}

/**
 * The custom add-relay form (the rail dialog's tab and the phone sheet's):
 * `wss://` to start with, the prefix-and-parse rule (`normalizeRelayInput`),
 * then add and switch to it, then `onAdded`.
 */
export function addRelayForm(onAdded: () => void): FormSpec<AddRelayValues> {
  return {
    initial: { url: 'wss://' },
    ready: (values) => filled(values.url),
    validate: (values) => (isRelayAddress(values.url) ? null : 'chat.relayForm.invalidUrl'),
    submit: (values) => addRelay(values.url, true),
    failure: 'chat.relayForm.addFailed',
    onSuccess: () => onAdded(),
  };
}

/**
 * One suggested relay's Add button: no fields, a no-op for a relay already
 * in the rail, and no switch (the person is browsing a list, not typing a
 * destination).
 */
export function suggestedRelayForm(url: string, alreadyAdded: boolean, onAdded: () => void): FormSpec<Record<string, never>> {
  return {
    initial: {},
    ready: () => !alreadyAdded,
    submit: () => addRelay(url, false),
    failure: 'chat.relayForm.addFailed',
    onSuccess: () => onAdded(),
  };
}
