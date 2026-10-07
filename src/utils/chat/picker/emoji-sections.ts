import type { MessageKey } from '@/i18n/keys';
import { EMOJI_CATEGORIES } from '@/lib/emoji';

/**
 * The picker's category sections: each groups one or more `EMOJI_CATEGORIES`.
 * `name` is the id the picker scrolls to; `labelKey` is what the reader sees.
 */
export const EMOJI_SECTIONS = [
  { name: 'Smileys', icon: '😀', labelKey: 'chat.emoji.section.smileys', categories: ['Smileys', 'Gestures'] },
  { name: 'Nature', icon: '🐝', labelKey: 'chat.emoji.section.nature', categories: ['Animals', 'Nature'] },
  { name: 'Food', icon: '☕', labelKey: 'chat.emoji.section.food', categories: ['Food'] },
  { name: 'Sports', icon: '🏀', labelKey: 'chat.emoji.section.sports', categories: ['Activities'] },
  { name: 'Cars', icon: '🚗', labelKey: 'chat.emoji.section.cars', categories: ['Transport'] },
  { name: 'Ideas', icon: '💡', labelKey: 'chat.emoji.section.ideas', categories: ['Objects'] },
  { name: 'Symbols', icon: '🎵', labelKey: 'chat.emoji.section.symbols', categories: ['Symbols'] },
  { name: 'Flags', icon: '🏳️', labelKey: 'chat.emoji.section.flags', categories: ['Flags'] },
] as const satisfies ReadonlyArray<{ name: string; icon: string; labelKey: MessageKey; categories: readonly string[] }>;

/** The category bar: Recent first, then every section. */
export const EMOJI_NAV: ReadonlyArray<{ name: string; icon: string; labelKey: MessageKey }> = [
  { name: 'Recent', icon: '◷', labelKey: 'chat.emoji.recent' },
  ...EMOJI_SECTIONS,
];

/** Every emoji of one picker section, its categories in order. */
export function sectionEmojis(section: { categories: readonly string[] }) {
  return section.categories.flatMap((category) => EMOJI_CATEGORIES[category] ?? []);
}
