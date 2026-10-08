/**
 * The phone relay menu's actions: share an invite, and leave a relay. The
 * sheet's hook (`useRelayMenuSheet`) adds the busy hints and the toasts.
 */
import { nostrActions } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { writeClipboardText } from '@/services/common/clipboard';
import type { Translate } from '@/i18n/keys';

/**
 * Hand the invite to the system share sheet when the browser has one, else
 * copy its text. Says which happened; a cancelled share rejects.
 */
export async function shareRelayInvite(invite: { title: string; text: string; url: string }): Promise<'shared' | 'copied'> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    await nav.share(invite);
    return 'shared';
  }
  await writeClipboardText(invite.text);
  return 'copied';
}

/** Ask before leaving: the relay leaves the rail and its channels go with it. */
export function confirmLeaveRelay(t: Translate, label: string): Promise<boolean> {
  return confirmDialog({
    title: t('mobile.relay.confirmLeave', { name: label }),
    message: t('shell.rail.confirmRemoveBody'),
    confirmLabel: t('common.confirm.leave'),
    icon: 'leave',
  });
}

/** Remove the relay from the rail and move to the next one in it, if any. */
export async function leaveRelay(relayUrl: string, relays: ReadonlyArray<string>): Promise<void> {
  const others = relays.filter((u) => u !== relayUrl);
  await nostrActions.removeRelay(relayUrl);
  if (others.length > 0) await nostrActions.switchRelay(others[0]);
}
