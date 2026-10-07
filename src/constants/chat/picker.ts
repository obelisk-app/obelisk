/**
 * Chat: picker. Values the code in
 * `utils/chat/picker/custom-emoji-entries.ts`,
 * `utils/chat/picker/emoji-sections.ts`, `utils/chat/picker/media-catalog.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { MessageKey } from '@/i18n/keys';
import type { MediaCategory } from '@/utils/chat/picker/media-catalog';

/** Most results a search shows per section. */
export const SEARCH_LIMIT = 80;

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

export const MEDIA_CATEGORIES = ['Recent', 'Trending', 'Reactions', 'Funny', 'Love', 'Celebration', 'Animals', 'Sports', 'Memes'] as const;

/** What the category bar calls each category; the values above double as GIPHY query ids. */
export const MEDIA_CATEGORY_LABEL: Record<MediaCategory, MessageKey> = {
  Recent: 'chat.mediaPicker.category.recent',
  Trending: 'chat.mediaPicker.category.trending',
  Reactions: 'chat.mediaPicker.category.reactions',
  Funny: 'chat.mediaPicker.category.funny',
  Love: 'chat.mediaPicker.category.love',
  Celebration: 'chat.mediaPicker.category.celebration',
  Animals: 'chat.mediaPicker.category.animals',
  Sports: 'chat.mediaPicker.category.sports',
  Memes: 'chat.mediaPicker.category.memes',
};

/** GIPHY's API key; without one the picker shows only the built-in catalog. */
export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
