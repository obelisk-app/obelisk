'use client';

import { useForm } from '@/hooks/common/useForm';
import { suggestedRelayForm } from '@/services/relay/add-relay-form';

export interface SuggestedRelayAdd {
  readonly busy: boolean;
  readonly error: string | null;
  /** Add the relay (no switch), then `onAdded`. */
  readonly add: () => Promise<void>;
}

/** One suggested-relay row's Add button: the common form state over `suggestedRelayForm`. */
export function useSuggestedRelayAdd(url: string, alreadyAdded: boolean, onAdded: () => void): SuggestedRelayAdd {
  const form = useForm(suggestedRelayForm(url, alreadyAdded, onAdded));
  return { busy: form.submitting, error: form.error, add: () => form.submit() };
}
