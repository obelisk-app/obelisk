import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { messagePreviewSegments } from '@/utils/message-text/preview';
const labels = { image: 'Image', video: 'Video', audio: 'Audio', file: 'File' };
describe('message previews', () => {
  it('labels media with query strings while preserving prose and normal links', () => {
    const result = messagePreviewSegments('look https://x.test/a.jpg?q=1 then https://x.test/b.mp4#x https://x.test/c.mp3 https://example.com', labels, 300);
    expect(result).toEqual([{ type: 'text', text: 'look Image then Video Audio https://example.com' }]);
  });
  it('labels markdown media without leaving link markup', () => {
    expect(messagePreviewSegments('![photo](https://x.test/a.png)', labels)).toEqual([{ type: 'text', text: 'Image' }]);
  });
  it('keeps an intact mention even when its wire token exceeds the preview budget', () => {
    const pubkey = 'a'.repeat(64);
    const result = messagePreviewSegments(`hi nostr:${nip19.npubEncode(pubkey)} there`, labels, 20);
    expect(result[1]).toMatchObject({ type: 'mention', pubkey });
    expect(result.some((s) => s.type === 'text' && s.text.includes('npub'))).toBe(false);
  });
});
