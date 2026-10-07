/**
 * The emoji dataset shared by the picker and the shortcode autocomplete.
 *
 * Each emoji carries English and Spanish keywords (accent-free) so search works
 * in both languages; `normalizeEmojiKeyword` strips diacritics at query time.
 */
export type { EmojiEntry, SearchableEmoji } from './catalog/types';
export { normalizeEmojiKeyword } from './search/normalize';
export {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_NAMES,
  UNICODE_EMOJI_ENTRIES,
  SEARCHABLE_EMOJI,
} from './catalog/catalog';
