/**
 * Handing an invite link on: Copy and Share in Settings > Invite people.
 * Both run straight from the click (no await before the browser call), so
 * the clipboard and the share sheet still see the person's gesture.
 */
import { copyText } from '@/services/common/clipboard';
import { useToastStore } from '@/store/feedback/toast';

type ShareNavigator = Navigator & { share?: (data: ShareData) => Promise<void> };

/** Whether the browser has a system share sheet (phones, some desktops). */
export function canShareLinks(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as ShareNavigator).share === 'function';
}

/** Copy the link and say whether it worked; a refused clipboard says to copy it by hand. */
export async function copyInviteLink(link: string, copied: string, refused: string): Promise<boolean> {
  const ok = await copyText(link);
  useToastStore.getState().pushToast({ title: ok ? copied : refused, body: ok ? '' : link });
  return ok;
}

/**
 * Open the share sheet with the link; without one, copy it. A share the
 * person cancels is not an error.
 */
export async function shareInviteLink(
  share: { title: string; text: string; url: string },
  copied: string,
  refused: string,
): Promise<void> {
  const nav = navigator as ShareNavigator;
  if (typeof nav.share !== 'function') {
    await copyInviteLink(share.url, copied, refused);
    return;
  }
  try {
    await nav.share(share);
  } catch {
    // Cancelled, or the sheet refused: the link is still on screen to copy.
  }
}
