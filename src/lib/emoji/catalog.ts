import { normalizeEmojiKeyword } from './normalize';
import type { EmojiEntry, SearchableEmoji } from './types';
import { SMILEYS } from './categories/smileys';
import { GESTURES } from './categories/gestures';
import { OBJECTS } from './categories/objects';
import { FOOD } from './categories/food';
import { ANIMALS } from './categories/animals';
import { NATURE } from './categories/nature';
import { TRANSPORT } from './categories/transport';
import { SYMBOLS } from './categories/symbols';
import { FLAGS } from './categories/flags';
import { ACTIVITIES } from './categories/activities';

/**
 * Every category, keyed by the name shown on its picker tab.
 *
 * Order is significant: it is the tab order in the picker, and the order
 * the shortcode resolver walks entries in, so the first category to claim a
 * keyword wins. Keep new categories appended rather than inserted.
 */
export const EMOJI_CATEGORIES: Record<string, EmojiEntry[]> = {
  Smileys: SMILEYS,
  Gestures: GESTURES,
  Objects: OBJECTS,
  Food: FOOD,
  Animals: ANIMALS,
  Nature: NATURE,
  Transport: TRANSPORT,
  Symbols: SYMBOLS,
  Flags: FLAGS,
  Activities: ACTIVITIES,
};

export const EMOJI_CATEGORY_NAMES: string[] = Object.keys(EMOJI_CATEGORIES);

/** Flat list used by the shortcode resolver and search. */
export const UNICODE_EMOJI_ENTRIES: EmojiEntry[] = EMOJI_CATEGORY_NAMES.flatMap(
  (c) => EMOJI_CATEGORIES[c],
);

export const SEARCHABLE_EMOJI: SearchableEmoji[] = UNICODE_EMOJI_ENTRIES.map((e) => ({
  ...e,
  haystack: e.keywords.map(normalizeEmojiKeyword).join(' '),
}));
