/** True for an emoji given as an image URL (http(s), protocol-relative or a site path) rather than a character. */
export function isEmojiUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(https?:)?\/\//.test(value) || value.startsWith('/');
}

/**
 * Returns the emoji as plain text if it's a native/unicode emoji,
 * or an empty string if it's an image URL (which can't render inside
 * a native <option> element).
 */
export function emojiForOptionText(value: string | null | undefined): string {
  if (!value || isEmojiUrl(value)) return '';
  return value;
}
