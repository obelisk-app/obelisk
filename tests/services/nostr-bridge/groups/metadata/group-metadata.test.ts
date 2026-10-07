import { describe, expect, it } from 'vitest';
import { arraysEqualStrict, groupEqual, parseGroupMetadataTags, userMetadataEqual } from '@/services/nostr-bridge/groups/metadata/group-metadata';
import type { JsGroup, JsUserMetadata } from '@/services/nostr-bridge/common/types';

describe('parseGroupMetadataTags', () => {
  it('defaults to public, open, not hidden, not restricted, text', () => {
    const g = parseGroupMetadataTags([['d', 'grp']]);
    expect(g).toMatchObject({ d: 'grp', isPublic: true, isOpen: true, isHidden: false, isRestricted: false, channelKind: 'text' });
    expect(g.forumTags).toEqual([]);
    expect(g.topics).toEqual([]);
  });

  it('first occurrence wins for the scalar fields', () => {
    const g = parseGroupMetadataTags([['name', 'first'], ['name', 'second'], ['about', 'a'], ['parent', 'p']]);
    expect(g.name).toBe('first');
    expect(g.about).toBe('a');
    expect(g.parent).toBe('p');
  });

  it('reads the negative access tags and the legacy affirmative ones', () => {
    expect(parseGroupMetadataTags([['private'], ['closed'], ['hidden'], ['restricted']])).toMatchObject({
      isPublic: false, isOpen: false, isHidden: true, isRestricted: true,
    });
    expect(parseGroupMetadataTags([['public'], ['open']])).toMatchObject({ isPublic: true, isOpen: true });
  });

  it('ranks the channel kind voice-sfu > voice > forum > text', () => {
    expect(parseGroupMetadataTags([['t', 'forum'], ['t', 'voice']]).channelKind).toBe('voice');
    expect(parseGroupMetadataTags([['t', 'voice'], ['t', 'voice-sfu']]).channelKind).toBe('voice-sfu');
    expect(parseGroupMetadataTags([['t', 'forum']]).channelKind).toBe('forum');
  });

  it('keys forum tags by id (last wins), drops malformed ones, validates the color slot', () => {
    const g = parseGroupMetadataTags([
      ['forum-tag', 'bug', 'Bug', '', 'not-a-palette-key'],
      ['forum-tag', 'bug', 'Bugs'],
      ['forum-tag', '', 'no id'],
      ['forum-tag', 'noname'],
    ]);
    expect(g.forumTags).toEqual([{ id: 'bug', name: 'Bugs', emoji: null, color: null }]);
  });

  it('dedupes topics in document order', () => {
    expect(parseGroupMetadataTags([['topic', 'a'], ['topic', 'b'], ['topic', 'a'], ['topic', '']]).topics).toEqual(['a', 'b']);
  });
});

describe('arraysEqualStrict', () => {
  it('compares positionally', () => {
    expect(arraysEqualStrict(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(arraysEqualStrict(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(arraysEqualStrict(['a'], ['a', 'b'])).toBe(false);
  });
});

const group: JsGroup = {
  id: 'g', name: 'n', about: null, picture: null, banner: null,
  isPublic: true, isHidden: false, isRestricted: false, isOpen: true, parent: null, kind: 'text',
  forumTags: [{ id: 't', name: 'T', emoji: null, color: null }], topics: ['x'],
};

describe('groupEqual', () => {
  it('is true for a structurally identical copy', () => {
    expect(groupEqual(group, { ...group, forumTags: [{ ...group.forumTags[0] }], topics: [...group.topics] })).toBe(true);
  });

  it('is false when a scalar, a forum tag or a topic differs', () => {
    expect(groupEqual(group, { ...group, name: 'other' })).toBe(false);
    expect(groupEqual(group, { ...group, forumTags: [{ ...group.forumTags[0], color: 'green' }] })).toBe(false);
    expect(groupEqual(group, { ...group, topics: ['y'] })).toBe(false);
  });
});

describe('userMetadataEqual', () => {
  const meta: JsUserMetadata = {
    pubkey: 'pk', name: 'a', displayName: null, picture: null, about: null, nip05: null, banner: null, lud16: null, website: null,
  };

  it('compares every profile field', () => {
    expect(userMetadataEqual(meta, { ...meta })).toBe(true);
    expect(userMetadataEqual(meta, { ...meta, nip05: 'a@b' })).toBe(false);
  });
});
