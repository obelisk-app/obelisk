import { describe, expect, it } from 'vitest';
import { dmTextSegments } from '@/utils/chat/dm/dm-text-segments';

describe('dmTextSegments', () => {
  it('cuts text into text, emoji and link segments in order', () => {
    expect(dmTextSegments('hi :logo: see https://x.example/a ok', { logo: 'https://x/l.png' })).toEqual([
      { kind: 'text', key: 't0-0', text: 'hi ' },
      { kind: 'emoji', key: 'e0-3', url: 'https://x/l.png', name: 'logo' },
      { kind: 'text', key: 't0-15', text: ' see ' },
      { kind: 'link', key: 'u1', url: 'https://x.example/a' },
      { kind: 'text', key: 't2-0', text: ' ok' },
    ]);
  });

  it('plain text is one segment, empty text none', () => {
    expect(dmTextSegments('words', {})).toEqual([{ kind: 'text', key: 't0-0', text: 'words' }]);
    expect(dmTextSegments('', {})).toEqual([]);
  });

  it('a placeholder whose emoji is unknown comes back as its shortcode', () => {
    const segments = dmTextSegments('〈EMOJI:gone〉', {});
    expect(segments).toEqual([{ kind: 'text', key: 'e0-0', text: ':gone:' }]);
  });

  it('is repeatable (no matcher state leaks between calls)', () => {
    const a = dmTextSegments(':logo: :logo:', { logo: 'u' });
    expect(dmTextSegments(':logo: :logo:', { logo: 'u' })).toEqual(a);
    expect(a.filter((s) => s.kind === 'emoji')).toHaveLength(2);
  });
});
