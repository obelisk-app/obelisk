import { describe, expect, it } from 'vitest';
import {
  appendMediaUrls,
  builtinCommandOf,
  outgoingTags,
  pastedMediaFiles,
  removeUrlLine,
  slashQueryOf,
  withPickedMedia,
} from '@/hooks/chat/composer/draft-text';

describe('draft-text', () => {
  it('slashQueryOf is the partial command only while the draft is just `/word`', () => {
    expect(slashQueryOf('/za')).toBe('za');
    expect(slashQueryOf('/')).toBe('');
    expect(slashQueryOf('/zap 100')).toBeNull();
    expect(slashQueryOf('hi /za')).toBeNull();
  });

  it('builtinCommandOf finds the built-in a draft starts with, case-insensitively', () => {
    expect(builtinCommandOf('/ZAP 100')?.name).toBe('zap');
    expect(builtinCommandOf('/play')?.name).toBe('play');
    expect(builtinCommandOf('/nope')).toBeNull();
    expect(builtinCommandOf('zap')).toBeNull();
  });

  it('appendMediaUrls puts each URL on its own line after the trimmed draft', () => {
    expect(appendMediaUrls('', ['a', 'b'])).toBe('a\nb');
    expect(appendMediaUrls(' look \n', ['a'])).toBe('look\na');
  });

  it('removeUrlLine drops the line and collapses the gap', () => {
    expect(removeUrlLine('x\n\nhttps://i/a.png\n\ny', 'https://i/a.png')).toBe('x\n\ny');
  });

  it('withPickedMedia: sticker replaces, gif gets a line, emoji appends', () => {
    expect(withPickedMedia('hi', 'S', 'sticker')).toBe('S');
    expect(withPickedMedia(' hi ', 'G', 'gif')).toBe('hi\nG');
    expect(withPickedMedia('', 'G', 'gif')).toBe('G');
    expect(withPickedMedia('hi', ':)')).toBe('hi:)');
  });

  it('pastedMediaFiles keeps image and video files only', () => {
    const img = new File(['x'], 'a.png', { type: 'image/png' });
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const item = (f: File | null, kind = 'file') => ({ kind, getAsFile: () => f }) as unknown as DataTransferItem;
    expect(pastedMediaFiles([item(img), item(txt), item(null, 'string')])).toEqual([img]);
  });

  it('outgoingTags attaches a used custom emoji', () => {
    const tags = outgoingTags('hello :wave:', {
      serverEmojis: { wave: 'https://e/wave.png' },
      draftCustomEmojis: {},
      draftSticker: null,
      draftVoiceNote: null,
    });
    expect(tags).toContainEqual(['emoji', 'wave', 'https://e/wave.png']);
  });

  it('outgoingTags tags a draft that is exactly the recorded voice note', () => {
    const media = { serverEmojis: {}, draftCustomEmojis: {}, draftSticker: null, draftVoiceNote: { url: 'https://b/v.webm', durationSeconds: 3 } };
    expect(outgoingTags('https://b/v.webm', media)).toEqual([['voice', 'https://b/v.webm', '3']]);
    expect(outgoingTags('edited https://b/v.webm', media)).toEqual([]);
  });
});
