/** One emoji with English and Spanish search keywords (stored accent-free). */
export interface EmojiEntry {
  char: string;
  keywords: string[];
}

/** An entry with its keywords pre-normalised into one string for substring search. */
export interface SearchableEmoji extends EmojiEntry {
  haystack: string;
}
