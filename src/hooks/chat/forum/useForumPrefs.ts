'use client';

import { useCallback, useState } from 'react';
import { loadForumPrefs, saveForumPrefs, type ForumPrefs } from '@/services/chat/forum/forum-prefs';

export interface ForumPrefsState {
  readonly prefs: ForumPrefs;
  /** Merge a partial change, persist it, and re-render. */
  readonly update: (patch: Partial<ForumPrefs>) => void;
}

interface Tracked {
  readonly forumGroupId: string;
  readonly prefs: ForumPrefs;
}

/**
 * Sort / view / tag-match preferences for one forum, persisted under the
 * key both shells share (see `src/services/chat/forum/forum-prefs.ts`).
 *
 * The stored value is tagged with the forum it belongs to, so switching
 * forums re-reads storage on the next render instead of in an effect (an
 * effect would paint the previous forum's choice for one frame).
 */
export function useForumPrefs(forumGroupId: string): ForumPrefsState {
  const [tracked, setTracked] = useState<Tracked>(() => ({ forumGroupId, prefs: loadForumPrefs(forumGroupId) }));
  const prefs = tracked.forumGroupId === forumGroupId ? tracked.prefs : loadForumPrefs(forumGroupId);

  const update = useCallback((patch: Partial<ForumPrefs>) => {
    setTracked((current) => {
      const base = current.forumGroupId === forumGroupId ? current.prefs : loadForumPrefs(forumGroupId);
      const next = { ...base, ...patch };
      saveForumPrefs(forumGroupId, next);
      return { forumGroupId, prefs: next };
    });
  }, [forumGroupId]);

  return { prefs, update };
}
