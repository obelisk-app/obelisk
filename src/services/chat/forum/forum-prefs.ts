/**
 * Per-forum reading preferences (sort order, list vs gallery, any/all tag
 * matching), persisted in localStorage.
 *
 * There is one key for both shells. The phone shell used to write
 * `obelisk-dex/forum-prefs-mobile/<id>` while the desktop `ForumView` read
 * `obelisk-dex/forum-prefs/<id>`, so a reader who crossed the 1024px
 * breakpoint in the same browser lost their sort choice. `loadForumPrefs`
 * migrates a leftover mobile entry on first read and removes it.
 */

export type ForumSortBy = 'recent' | 'created';
export type ForumViewMode = 'list' | 'gallery';
export type ForumTagMatch = 'any' | 'all';

export interface ForumPrefs {
  readonly sortBy: ForumSortBy;
  readonly viewMode: ForumViewMode;
  readonly tagMatch: ForumTagMatch;
}

export const DEFAULT_FORUM_PREFS: ForumPrefs = { sortBy: 'recent', viewMode: 'list', tagMatch: 'any' };

export function forumPrefsKey(forumGroupId: string): string {
  return `obelisk-dex/forum-prefs/${forumGroupId}`;
}

/** The phone shell's former key; read once for migration, then deleted. */
export function legacyMobileForumPrefsKey(forumGroupId: string): string {
  return `obelisk-dex/forum-prefs-mobile/${forumGroupId}`;
}

function sanitize(raw: string | null): ForumPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ForumPrefs>;
    return {
      sortBy: parsed.sortBy === 'created' ? 'created' : 'recent',
      viewMode: parsed.viewMode === 'gallery' ? 'gallery' : 'list',
      tagMatch: parsed.tagMatch === 'all' ? 'all' : 'any',
    };
  } catch {
    return null;
  }
}

export function loadForumPrefs(forumGroupId: string): ForumPrefs {
  if (typeof window === 'undefined') return DEFAULT_FORUM_PREFS;
  try {
    const storage = window.localStorage;
    const current = sanitize(storage.getItem(forumPrefsKey(forumGroupId)));
    if (current) return current;
    const legacy = sanitize(storage.getItem(legacyMobileForumPrefsKey(forumGroupId)));
    if (legacy) {
      // The mobile shell never stored a view mode; keep the default rather
      // than inventing one.
      storage.setItem(forumPrefsKey(forumGroupId), JSON.stringify(legacy));
      storage.removeItem(legacyMobileForumPrefsKey(forumGroupId));
      return legacy;
    }
    return DEFAULT_FORUM_PREFS;
  } catch {
    return DEFAULT_FORUM_PREFS;
  }
}

export function saveForumPrefs(forumGroupId: string, prefs: ForumPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(forumPrefsKey(forumGroupId), JSON.stringify(prefs));
  } catch {
    // ignore quota / private-mode failures
  }
}
