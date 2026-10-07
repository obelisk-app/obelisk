/**
 * Message text: markdown. Values the code in `utils/message-text/markdown.ts`
 * reads, kept here so every reader imports the one copy.
 */

export const EVERYONE_PLACEHOLDER = '\u3008EVERYONE\u3009';

/**
 * Regex to find mention placeholders in rendered text.
 */
export const MENTION_PLACEHOLDER_REGEX = /\u3008MENTION:(\d+)\u3009/g;
