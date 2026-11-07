import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions } from '@/services/nostr-bridge';
import { confirmLeaveRelay } from '@/services/shell/mobile/relay-menu';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { errorText } from '@/utils/errors/error-text';
import { useToastStore } from '@/store/feedback/toast';

/** Remove the displayed relay through the bridge's active-relay fallback. */
export function useRelayDeckRemoval(relays: readonly string[], front: number, onClose: () => void) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const url = relays[front];
  const remove = async () => {
    if (busy || relays.length < 2 || !url) return;
    setBusy(true);
    try {
      if (!(await confirmLeaveRelay(t, relayHostLabel(url)))) return;
      await nostrActions.removeRelay(url);
      onClose();
    } catch (error) {
      useToastStore.getState().pushToast({ title: errorText(t, error), body: '' });
    } finally {
      setBusy(false);
    }
  };
  return {
    disabled: busy || relays.length < 2 || !url,
    label: t('shell.rail.removeLabel', { name: url ? relayHostLabel(url) : '' }),
    remove: () => void remove(),
  };
}
