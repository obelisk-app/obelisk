import { describe, expect, it } from 'vitest';
import {
  customEmojiMapFromTags,
  emojiTagsForContent,
  mergeCustomEmojiMaps,
  normalizeCustomEmojiName,
} from '@/lib/custom-emoji-tags';

describe('custom emoji tags', () => {
  it('normalizes names for NIP-30 emoji tags', () => {
    expect(normalizeCustomEmojiName(' Party Parrot.webp ')).toBe('party_parrot');
    expect(normalizeCustomEmojiName('La-Cripta!')).toBe('la_cripta');
  });

  it('extracts only used custom emojis from message content', () => {
    const tags = emojiTagsForContent(
      'hello :party: `:ignored:`\n```txt\n:also_ignored:\n``` :wave:',
      {
        party: 'https://example.com/party.webp',
        ignored: 'https://example.com/ignored.webp',
        wave: 'https://example.com/wave.webp',
      },
    );

    expect(tags).toEqual([
      ['emoji', 'party', 'https://example.com/party.webp'],
      ['emoji', 'wave', 'https://example.com/wave.webp'],
    ]);
  });

  it('parses and merges emoji tags with later maps winning', () => {
    expect(customEmojiMapFromTags([
      ['emoji', 'Party', 'https://example.com/old.webp'],
      ['emoji', 'bad name', 'https://example.com/bad.webp'],
      ['emoji', 'wave', 'https://example.com/wave.webp'],
    ])).toEqual({
      party: 'https://example.com/old.webp',
      bad_name: 'https://example.com/bad.webp',
      wave: 'https://example.com/wave.webp',
    });

    expect(mergeCustomEmojiMaps(
      { party: 'https://example.com/old.webp' },
      { PARTY: 'https://example.com/new.webp' },
    )).toEqual({
      party: 'https://example.com/new.webp',
    });
  });
});
