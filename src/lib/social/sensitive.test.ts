import { describe, expect, it } from 'vitest';
import { contentWarningTags, sensitiveInfo } from './sensitive';

describe('sensitiveInfo', () => {
  it('reads a content-warning with a reason', () => {
    expect(sensitiveInfo({ tags: [['content-warning', 'nudity']] }))
      .toEqual({ sensitive: true, reason: 'nudity' });
  });

  it('handles the bare one-element tag', () => {
    expect(sensitiveInfo({ tags: [['content-warning']] }))
      .toEqual({ sensitive: true, reason: null });
  });

  it('handles the empty-reason tag Amethyst actually emits', () => {
    // Amethyst's "mark sensitive" toggle produces ["content-warning", ""].
    expect(sensitiveInfo({ tags: [['content-warning', '']] }))
      .toEqual({ sensitive: true, reason: null });
  });

  it('treats nsfw/nude hashtags as sensitive, case-insensitively', () => {
    // This is the only signal Damus users ever get, and Amethyst reads it too.
    expect(sensitiveInfo({ tags: [['t', 'NSFW']] }).sensitive).toBe(true);
    expect(sensitiveInfo({ tags: [['t', 'nude']] }).sensitive).toBe(true);
  });

  it('tolerates NIP-32 labels on read', () => {
    expect(sensitiveInfo({ tags: [['l', 'nudity', 'content-warning']] }))
      .toEqual({ sensitive: true, reason: 'nudity' });
  });

  it('is not sensitive for an ordinary note', () => {
    expect(sensitiveInfo({ tags: [['t', 'bitcoin']] }))
      .toEqual({ sensitive: false, reason: null });
  });
});

describe('contentWarningTags', () => {
  it('always writes a reason and an nsfw hashtag for Damus reach', () => {
    // Damus has no NIP-36 support at all — without the hashtag its users get
    // no warning whatsoever.
    expect(contentWarningTags('nudity')).toEqual([
      ['content-warning', 'nudity'],
      ['t', 'nsfw'],
    ]);
  });

  it('substitutes a default rather than emitting a blank reason', () => {
    expect(contentWarningTags('  ')[0]).toEqual(['content-warning', 'sensitive content']);
  });

  it('does not duplicate an nsfw hashtag the note already has', () => {
    expect(contentWarningTags('nudity', [['t', 'nsfw']]))
      .toEqual([['content-warning', 'nudity']]);
  });
});
