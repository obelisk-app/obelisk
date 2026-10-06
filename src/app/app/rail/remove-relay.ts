import { nostrActions } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Remove a relay from the rail after the user confirms. The last relay is
 * never removed: the app needs one to stand on.
 */
export async function confirmAndRemoveRelay(
  url: string,
  relayCount: number,
  t: (key: string) => string,
): Promise<void> {
  if (relayCount <= 1) return;
  const ok = await confirmDialog({
    title: t('rail.confirmRemove').replace('{host}', shortHost(url)),
    message: t('rail.confirmRemoveBody'),
    confirmLabel: t('confirm.remove'),
    icon: 'leave',
  });
  if (ok) nostrActions.removeRelay(url);
}
