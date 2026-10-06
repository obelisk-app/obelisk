import { nostrActions } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import { confirmDialog } from '@/services/confirm-dialog';
import type { Translate } from '@/i18n/keys';

/**
 * Remove a relay from the rail after the user confirms. The last relay is
 * never removed: the app needs one to stand on.
 */
export async function confirmAndRemoveRelay(
  url: string,
  relayCount: number,
  t: Translate,
): Promise<void> {
  if (relayCount <= 1) return;
  const ok = await confirmDialog({
    title: t('shell.rail.confirmRemove', { host: shortHost(url) }),
    message: t('shell.rail.confirmRemoveBody'),
    confirmLabel: t('common.confirm.remove'),
    icon: 'leave',
  });
  if (ok) nostrActions.removeRelay(url);
}
