/**
 * Pure helpers for one desktop message row.
 */

/** Elements inside a message body that own their click: links, buttons, fields, and anything marked `data-no-msg-menu`. */
const INTERACTIVE = 'a, button, input, textarea, [data-no-msg-menu]';

/** True when a click on the body landed on something that handles it itself, so the row must not pin its toolbar. */
export function isInteractiveClick(target: Element): boolean {
  return target.closest(INTERACTIVE) !== null;
}

/** A custom emoji picked from the picker as the reaction's emoji-tag map, or nothing for a unicode one. */
export function pickedEmojiTags(custom: { name: string; url: string } | undefined): Record<string, string> | undefined {
  return custom ? { [custom.name]: custom.url } : undefined;
}
