'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';

/**
 * Holds a pasted nsec back from the bridge until its owner has read the
 * notice (`PastedKeyNoticeStep`). The SDK hands `{ method: 'import', nsec }`
 * to `intercept`; nothing is stored and the bridge has not seen the key
 * until `confirm`. `back` drops it and returns to the method list. Every
 * other method passes straight through to `onLogin`.
 */
export function usePastedKeyStep<A extends { method: string }>(onLogin: (args: A) => Promise<void>) {
  const t = useTranslations();
  const [pending, setPending] = useState<A | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const intercept = useCallback(async (args: A) => {
    if (args.method !== 'import') return onLogin(args);
    setError('');
    setPending(args);
  }, [onLogin]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await onLogin(pending);
      setPending(null);
    } catch (err) {
      setError(errorText(t, err, 'shell.login.keyLoginFailed'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setPending(null);
    setError('');
  };

  return { pending: pending !== null, intercept, confirm, back, busy, error };
}
