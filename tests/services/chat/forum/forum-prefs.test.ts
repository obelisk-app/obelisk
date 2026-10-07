import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FORUM_PREFS,
  forumPrefsKey,
  legacyMobileForumPrefsKey,
  loadForumPrefs,
  saveForumPrefs,
} from '@/services/chat/forum/forum-prefs';

describe('forum prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults when nothing is stored', () => {
    expect(loadForumPrefs('f1')).toEqual(DEFAULT_FORUM_PREFS);
  });

  it('round-trips through the shared key', () => {
    saveForumPrefs('f1', { sortBy: 'created', viewMode: 'gallery', tagMatch: 'all' });
    expect(localStorage.getItem(forumPrefsKey('f1'))).not.toBeNull();
    expect(loadForumPrefs('f1')).toEqual({ sortBy: 'created', viewMode: 'gallery', tagMatch: 'all' });
  });

  it('sanitizes unknown values back to the defaults', () => {
    localStorage.setItem(forumPrefsKey('f1'), JSON.stringify({ sortBy: 'weird', viewMode: 3, tagMatch: null }));
    expect(loadForumPrefs('f1')).toEqual(DEFAULT_FORUM_PREFS);
    localStorage.setItem(forumPrefsKey('f1'), '{not json');
    expect(loadForumPrefs('f1')).toEqual(DEFAULT_FORUM_PREFS);
  });

  it('migrates a leftover mobile entry to the shared key and deletes the old one', () => {
    // A phone user who had picked "created" under the old mobile-only key
    // must not lose that choice when the key is unified.
    localStorage.setItem(legacyMobileForumPrefsKey('f1'), JSON.stringify({ sortBy: 'created', tagMatch: 'all' }));
    expect(loadForumPrefs('f1')).toEqual({ sortBy: 'created', viewMode: 'list', tagMatch: 'all' });
    expect(localStorage.getItem(legacyMobileForumPrefsKey('f1'))).toBeNull();
    expect(JSON.parse(localStorage.getItem(forumPrefsKey('f1')) ?? '{}')).toMatchObject({ sortBy: 'created', tagMatch: 'all' });
  });

  it('prefers the shared key over a stale mobile entry', () => {
    localStorage.setItem(forumPrefsKey('f1'), JSON.stringify({ sortBy: 'recent', viewMode: 'gallery', tagMatch: 'any' }));
    localStorage.setItem(legacyMobileForumPrefsKey('f1'), JSON.stringify({ sortBy: 'created', tagMatch: 'all' }));
    expect(loadForumPrefs('f1')).toEqual({ sortBy: 'recent', viewMode: 'gallery', tagMatch: 'any' });
  });
});
