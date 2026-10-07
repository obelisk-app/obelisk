import { describe, expect, it } from 'vitest';
import { hasPlaceholder, placeholderSegments } from '@/utils/message-text/placeholder-segments';
import { EVERYONE_PLACEHOLDER } from '@/utils/message-text/markdown';

const mentions = new Map([['0', { pubkey: 'a'.repeat(64), displayName: 'Alice' }]]);
const emojis = { party: 'https://x/party.png' };

describe('placeholderSegments', () => {
  it('reads text, mentions, @everyone and emoji in order', () => {
    const segments = placeholderSegments(`hi 〈MENTION:0〉 ${EVERYONE_PLACEHOLDER}〈EMOJI:party〉!`, mentions, emojis);
    expect(segments.map((s) => s.kind)).toEqual(['text', 'mention', 'text', 'everyone', 'emoji', 'text']);
    expect(segments[1]).toMatchObject({ pubkey: 'a'.repeat(64), displayName: 'Alice' });
    expect(segments[4]).toMatchObject({ name: 'party', url: 'https://x/party.png' });
    expect(new Set(segments.map((s) => s.key)).size).toBe(segments.length);
  });

  it('drops an unknown mention, falls back to :name: for an unknown emoji, keeps a lone bracket', () => {
    const segments = placeholderSegments('a〈MENTION:9〉b〈EMOJI:gone〉c〈', mentions, emojis);
    expect(segments.filter((s) => s.kind === 'text').map((s) => (s as { text: string }).text).join('')).toBe('ab:gone:c〈');
    expect(segments.some((s) => s.kind === 'mention')).toBe(false);
  });

  it('plain or empty text is one text segment', () => {
    expect(placeholderSegments('plain', mentions, emojis)).toEqual([{ kind: 'text', key: 't-0', text: 'plain' }]);
    expect(placeholderSegments('', mentions, emojis)).toEqual([{ kind: 'text', key: 't-0', text: '' }]);
  });
});

describe('hasPlaceholder', () => {
  it('spots each placeholder kind', () => {
    expect(hasPlaceholder('〈MENTION:0〉')).toBe(true);
    expect(hasPlaceholder('〈EMOJI:x〉')).toBe(true);
    expect(hasPlaceholder(EVERYONE_PLACEHOLDER)).toBe(true);
    expect(hasPlaceholder('plain 〈')).toBe(false);
  });
});
