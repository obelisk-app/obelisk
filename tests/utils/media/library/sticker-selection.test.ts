import { describe, expect, it } from 'vitest';
import { stickerSelection } from '@/utils/media/library/sticker-selection';
import type { JsMediaPack } from '@/services/nostr-bridge';

describe('stickerSelection', () => {
  const pack = {
    address: '30030:aa:pack',
    items: [{ name: 'wave', url: 'https://x/wave.png', kind: 'sticker' }],
  } as unknown as JsMediaPack;

  it('finds the pack by address, or by the URL it holds', () => {
    expect(stickerSelection({ name: 'wave', url: 'https://x/wave.png', packAddress: '30030:aa:pack' }, { '30030:aa:pack': pack }).pack).toBe(pack);
    expect(stickerSelection({ name: 'wave', url: 'https://x/wave.png' }, { '30030:aa:pack': pack }).pack).toBe(pack);
  });

  it('falls back to an item built from the sticker', () => {
    expect(stickerSelection({ name: 'solo', url: 'https://x/solo.png' }, {})).toEqual({
      item: { name: 'solo', url: 'https://x/solo.png', kind: 'sticker' },
    });
  });
});
