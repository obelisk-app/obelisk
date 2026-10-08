'use client';

import { useCallback, useState } from 'react';
import { useForm } from '@/hooks/common/useForm';

/**
 * Holds a pasted nsec back from the bridge until its owner has read the
 * notice (`PastedKeyNoticeStep`). The SDK hands `{ method: 'import', nsec }`
 * to `intercept`; nothing is stored and the bridge has not seen the key
 * until `confirm`, which is a common form with no fields (its busy flag and
 * its error line). `back` drops it and returns to the method list. Every
 * other method passes straight through to `onLogin`.
 */
export function usePastedKeyStep<A extends { method: string }>(onLogin: (args: A) => Promise<void>) {
  const [pending, setPending] = useState<A | null>(null);
  const form = useForm({
    initial: {},
    ready: () => pending !== null,
    submit: () => (pending ? onLogin(pending) : undefined),
    failure: 'shell.login.keyLoginFailed',
    onSuccess: () => setPending(null),
  });
  const { setError } = form;

  const intercept = useCallback(async (args: A) => {
    if (args.method !== 'import') return onLogin(args);
    setError(null);
    setPending(args);
  }, [onLogin, setError]);

  const back = () => {
    setPending(null);
    form.setError(null);
  };

  return {
    pending: pending !== null,
    intercept,
    confirm: () => form.submit(),
    back,
    busy: form.submitting,
    error: form.error ?? '',
  };
}
