/** How long the ring stays on a message the navigator jumped to. */
export const FLASH_MS = 1800;
/** Closer than this to the bottom counts as "at the latest message". */
export const NEAR_BOTTOM_PX = 80;

/** A brief `ring-1 ring-lc-green` flash on the focused row. */
export function flashElement(el: Element): void {
  el.classList.add('ring-1', 'ring-lc-green');
  window.setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), FLASH_MS);
}

/**
 * Scroll the message with `data-msg-id="<id>"` into the middle of the view
 * and flash it. False when the scroller or the message is not there.
 */
export function scrollToId(scrollRoot: HTMLDivElement | null, id: string): boolean {
  if (!scrollRoot) return false;
  const el = scrollRoot.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashElement(el);
  return true;
}

/** True when a key press came from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  const tag = t?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t?.isContentEditable ?? false);
}
