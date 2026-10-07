/**
 * Bringing one message into view and flashing a ring on it, the way a
 * mention jump, a reply jump and a shared message link all land.
 *
 * The mention navigator and the message row each had their own copy (one
 * scoped to the scroller, one to the document, with different durations);
 * both go through `scrollToId` now.
 */

import { FLASH_MS } from '@/constants/chat/timeline';

/** A brief `ring-1 ring-lc-green` flash on the focused row. */
export function flashElement(el: Element, ms: number = FLASH_MS): void {
  el.classList.add('ring-1', 'ring-lc-green');
  window.setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), ms);
}

/**
 * Scroll the message with `data-msg-id="<id>"` under `scrollRoot` into the
 * middle of the view and flash it for `ms`. False when the root or the
 * message is not there.
 */
export function scrollToId(scrollRoot: ParentNode | null, id: string, ms: number = FLASH_MS): boolean {
  if (!scrollRoot) return false;
  const el = scrollRoot.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashElement(el, ms);
  return true;
}

/** The same jump anywhere on the page: what a message link or a reply quote does. */
export function flashMessage(messageId: string, ms: number): void {
  scrollToId(document, messageId, ms);
}

/** True when a key press came from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  const tag = t?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t?.isContentEditable ?? false);
}
