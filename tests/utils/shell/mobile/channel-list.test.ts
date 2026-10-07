import { describe, expect, it } from 'vitest';
import { indexById } from '@/utils/shell/mobile/channel-list';

describe('indexById', () => {
  it('keys the items by id, the last one winning on a repeat', () => {
    expect(indexById([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'a', n: 3 }])).toEqual({ a: { id: 'a', n: 3 }, b: { id: 'b', n: 2 } });
  });
});

describe('the server list helpers', () => {
  it('keeps channels with no parent or an unknown one as roots', async () => {
    const { rootChannels, indexById: byId } = await import('@/utils/shell/mobile/channel-list');
    const groups = [{ id: 'a', parent: null }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'zz' }];
    expect(rootChannels(groups, byId(groups)).map((g) => g.id)).toEqual(['a', 'c']);
  });

  it('maps ids back to channels, skipping unknown ones', async () => {
    const { channelsFromIds } = await import('@/utils/shell/mobile/channel-list');
    expect(channelsFromIds(['x', 'a', 'b'], { a: 1, b: 2 })).toEqual([1, 2]);
  });

  it('flips one key', async () => {
    const { toggleKey } = await import('@/utils/shell/mobile/channel-list');
    expect(toggleKey({ a: true }, 'a')).toEqual({ a: false });
    expect(toggleKey({}, 'b')).toEqual({ b: true });
  });

  it('names the space after the branding, the document, the host, then the app', async () => {
    const { spaceLabel } = await import('@/utils/shell/mobile/channel-list');
    expect(spaceLabel('Brand', 'Doc', 'wss://h.test')).toBe('Brand');
    expect(spaceLabel('', 'Doc', 'wss://h.test')).toBe('Doc');
    expect(spaceLabel('', undefined, 'wss://h.test')).toBe('h.test');
    expect(spaceLabel('', undefined, '')).toBe('Obelisk');
  });
});
