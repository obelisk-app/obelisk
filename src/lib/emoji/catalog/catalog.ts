import { normalizeEmojiKeyword } from '../search/normalize';
import type { EmojiEntry, SearchableEmoji } from './types';
import { SMILEYS } from './smileys';
import { GESTURES } from './gestures';
import { OBJECTS } from './objects';
import { FOOD } from './food';
import { ANIMALS } from './animals';
import { NATURE } from './nature';
import { TRANSPORT } from './transport';
import { SYMBOLS } from './symbols';
import { FLAGS } from './flags';
import { ACTIVITIES } from './activities';

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
