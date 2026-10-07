import { beforeEach, describe, expect, it } from 'vitest';
import { loadRecentMedia, saveRecentMedia } from '@/services/chat/picker/recent-media';

describe('recent media', () => {
  beforeEach(() => localStorage.clear());

  it('survives bad storage and keeps the newest 24, one per URL', () => {
    localStorage.setItem('obelisk:recent-media', '{not json');
    expect(loadRecentMedia()).toEqual([]);
    for (let i = 0; i < 30; i += 1) saveRecentMedia({ name: `m${i}`, url: `https://x/${i}.gif`, tab: 'gif' });
    const again = saveRecentMedia({ name: 'm29', url: 'https://x/29.gif', tab: 'gif' });
    expect(again).toHaveLength(24);
    expect(again[0].url).toBe('https://x/29.gif');
    expect(again.filter((e) => e.url === 'https://x/29.gif')).toHaveLength(1);
  });
});
