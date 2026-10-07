/**
 * The phone channel's reply jump: bring the quoted message into the middle of
 * the view and tint it briefly with the stylesheet's `.msg-flash`. Nothing
 * happens when the message is not on the page (not loaded yet).
 */

/** How long the tint stays on the message a reply quote jumped to. */
const REPLY_FLASH_MS = 1200;

export function flashMobileMessage(messageId: string, ms: number = REPLY_FLASH_MS): boolean {
  const el = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('msg-flash');
  setTimeout(() => el.classList.remove('msg-flash'), ms);
  return true;
}
