import { describe, expect, it } from 'vitest';
import { moderationEntries, moderationEntryKey } from '@/utils/settings/moderation-entries';

describe('moderation entries', () => {
  it('lists the muted, then the blocked, keyed by kind and person', () => {
    const entries = moderationEntries(['a', 'b'], ['a']);
    expect(entries).toEqual([
      { pubkey: 'a', kind: 'mute' }, { pubkey: 'b', kind: 'mute' }, { pubkey: 'a', kind: 'block' },
    ]);
    expect(entries.map(moderationEntryKey)).toEqual(['mute:a', 'mute:b', 'block:a']);
    expect(moderationEntries([], [])).toEqual([]);
  });
});
