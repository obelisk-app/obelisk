/**
 * Whether a publication's thread list is folded in the desktop sidebar, kept
 * per publication in localStorage (`obelisk-dex/forum-collapsed/<id>` = '1'
 * means folded; missing means open). The phone's server screen reads and
 * writes the same keys (`useForumCollapsed`), so a fold follows the person
 * across both shells.
 */

const FORUM_COLLAPSED_PREFIX = 'obelisk-dex/forum-collapsed/';

/** The saved fold for one publication; open when nothing was saved or there is no storage. */
export function readForumCollapsed(groupId: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`${FORUM_COLLAPSED_PREFIX}${groupId}`) === '1';
}

/** Save one publication's fold. */
export function writeForumCollapsed(groupId: string, collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  const key = `${FORUM_COLLAPSED_PREFIX}${groupId}`;
  if (collapsed) window.localStorage.setItem(key, '1');
  else window.localStorage.removeItem(key);
}
