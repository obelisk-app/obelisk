/**
 * Lower-cases and strips diacritics, so typing "corazon" matches "corazón".
 * Used on both the stored keywords and the user's query.
 */
export function normalizeEmojiKeyword(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
