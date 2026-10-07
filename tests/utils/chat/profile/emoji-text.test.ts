import { describe, expect, it } from 'vitest';
import { emojiTextSegments } from '@/utils/chat/profile/emoji-text';

describe('emojiTextSegments', () => {
  it('reads known emoji between text, repeatedly', () => {
    for (let i = 0; i < 2; i += 1) {
      expect(emojiTextSegments('hi :logo: there', { logo: 'https://x/l.png' })).toEqual([
        { kind: 'text', key: 't0', text: 'hi ' },
        { kind: 'emoji', key: 'e0', name: 'logo', url: 'https://x/l.png' },
        { kind: 'text', key: 't1', text: ' there' },
      ]);
    }
  });

  it('plain text is one segment; empty text none; an unknown placeholder is dropped', () => {
    expect(emojiTextSegments('plain', {})).toEqual([{ kind: 'text', key: 't0', text: 'plain' }]);
    expect(emojiTextSegments('', {})).toEqual([]);
    expect(emojiTextSegments('a〈EMOJI:gone〉b', {}).map((s) => s.kind === 'text' && s.text)).toEqual(['a', 'b']);
  });
});
