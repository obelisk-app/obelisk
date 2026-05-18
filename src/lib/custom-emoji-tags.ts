export type CustomEmojiMap = Record<string, string>;

export const CUSTOM_EMOJI_NAME_RE = /^[a-z0-9_]{1,64}$/;

const SHORTCODE_TOKEN_REGEX =
  /(^|[\s>(])(:([a-z0-9_]{1,64}):)(?=$|[\s.,!?;:)])/gi;

export function normalizeCustomEmojiName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function isValidCustomEmojiName(name: string): boolean {
  return CUSTOM_EMOJI_NAME_RE.test(name);
}

export function customEmojiMapFromTags(tags: ReadonlyArray<ReadonlyArray<string>>): CustomEmojiMap {
  const out: CustomEmojiMap = {};
  for (const tag of tags) {
    if (tag[0] !== 'emoji') continue;
    const name = normalizeCustomEmojiName(tag[1] ?? '');
    const url = tag[2]?.trim();
    if (!isValidCustomEmojiName(name) || !url) continue;
    out[name] = url;
  }
  return out;
}

export function emojiTagsForContent(content: string, customEmojis: CustomEmojiMap): string[][] {
  if (!content || !content.includes(':')) return [];
  const seen = new Set<string>();
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i += 2) {
    const segment = parts[i];
    if (!segment || !segment.includes(':')) continue;
    segment.replace(SHORTCODE_TOKEN_REGEX, (_match, _pre: string, _full: string, rawName: string) => {
      const name = normalizeCustomEmojiName(rawName);
      if (customEmojis[name]) seen.add(name);
      return _match;
    });
  }
  return Array.from(seen)
    .sort()
    .map((name) => ['emoji', name, customEmojis[name]]);
}

export function mergeCustomEmojiMaps(
  ...maps: ReadonlyArray<CustomEmojiMap | null | undefined>
): CustomEmojiMap {
  const out: CustomEmojiMap = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [rawName, url] of Object.entries(map)) {
      const name = normalizeCustomEmojiName(rawName);
      if (isValidCustomEmojiName(name) && url) out[name] = url;
    }
  }
  return out;
}

