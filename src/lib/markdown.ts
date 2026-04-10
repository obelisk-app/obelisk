import { parseMentions, MemberInfo } from './mentions';

const PLACEHOLDER_PREFIX = '\u3008MENTION:';
const PLACEHOLDER_SUFFIX = '\u3009';

export interface MentionData {
  pubkey: string;
  displayName: string;
}

export interface PreprocessResult {
  text: string;
  mentions: Map<string, MentionData>;
}

/**
 * Replace mention tokens with placeholders so markdown parsing doesn't mangle them.
 * After markdown renders, swap placeholders back to React mention chips.
 */
export function preprocessForMarkdown(content: string, members: MemberInfo[]): PreprocessResult {
  const segments = parseMentions(content, members);
  const mentions = new Map<string, MentionData>();
  let text = '';
  let idx = 0;

  for (const seg of segments) {
    if (seg.type === 'mention') {
      const key = `${idx}`;
      mentions.set(key, { pubkey: seg.pubkey, displayName: seg.displayName });
      text += `${PLACEHOLDER_PREFIX}${key}${PLACEHOLDER_SUFFIX}`;
      idx++;
    } else {
      text += seg.text;
    }
  }

  return { text, mentions };
}

/**
 * Regex to find mention placeholders in rendered text.
 */
export const MENTION_PLACEHOLDER_REGEX = /\u3008MENTION:(\d+)\u3009/g;

/**
 * Extract all URLs from text content.
 */
export function extractUrls(content: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>)"'\]]+)/g;
  const matches = content.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}

const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

export function isImageUrl(url: string): boolean {
  return IMAGE_REGEX.test(url);
}

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}
