import { describe, expect, it } from 'vitest';
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  SEARCHABLE_EMOJI,
  UNICODE_EMOJI_ENTRIES,
  normalizeEmojiKeyword,
} from '@/lib/emoji';

describe('emoji catalog', () => {
  // Order is the picker's tab order and the order the shortcode resolver walks,
  // so the first category to claim a keyword wins. A reorder is a behaviour change.
  it('keeps the categories in tab order', () => {
    expect(EMOJI_CATEGORY_NAMES).toEqual([
      'Smileys', 'Gestures', 'Objects', 'Food', 'Animals',
      'Nature', 'Transport', 'Symbols', 'Flags', 'Activities',
    ]);
  });

  it('gives every entry a character and at least one keyword', () => {
    for (const name of EMOJI_CATEGORY_NAMES) {
      expect(EMOJI_CATEGORIES[name].length, name).toBeGreaterThan(0);
      for (const e of EMOJI_CATEGORIES[name]) {
        expect(e.char, name).not.toBe('');
        expect(e.keywords.length, e.char).toBeGreaterThan(0);
      }
    }
  });

  it('stores keywords lower-case and accent-free, as search assumes', () => {
    const bad = UNICODE_EMOJI_ENTRIES.flatMap((e) =>
      e.keywords.filter((k) => k !== normalizeEmojiKeyword(k)).map((k) => `${e.char} ${k}`),
    );
    expect(bad).toEqual([]);
  });

  it('flattens every category, in order, into the search list', () => {
    const total = EMOJI_CATEGORY_NAMES.reduce((n, c) => n + EMOJI_CATEGORIES[c].length, 0);
    expect(UNICODE_EMOJI_ENTRIES).toHaveLength(total);
    expect(SEARCHABLE_EMOJI).toHaveLength(total);
    expect(UNICODE_EMOJI_ENTRIES[0]).toBe(EMOJI_CATEGORIES.Smileys[0]);
  });

  it('builds a normalised haystack per entry', () => {
    for (const e of SEARCHABLE_EMOJI) {
      expect(e.haystack).toBe(e.keywords.map(normalizeEmojiKeyword).join(' '));
    }
  });
});

describe('normalizeEmojiKeyword', () => {
  it('lower-cases and strips diacritics so "corazon" matches "corazón"', () => {
    expect(normalizeEmojiKeyword('Corazón')).toBe('corazon');
    expect(normalizeEmojiKeyword('ÁÉÍÓÚ ñ')).toBe('aeiou n');
  });
});
