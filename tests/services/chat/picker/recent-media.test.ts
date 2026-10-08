import { beforeEach, describe, expect, it } from 'vitest';
import { loadRecentMedia, saveRecentMedia } from '@/services/chat/picker/recent-media';

describe('recent media', () => {
  beforeEach(() => localStorage.clear());

  it('drops malformed entries before deduping or rendering recents', () => {
    const kept = { name: 'kept', url: 'https://x/kept.gif', tab: 'gif', kind: 'gif', packAddress: 'pack', categories: ['Funny'] };
    localStorage.setItem('obelisk:recent-media', JSON.stringify([
      null, 4, 'text', {}, { ...kept, name: null }, { ...kept, url: 5 },
      { ...kept, tab: 'emoji' }, { ...kept, kind: 'unknown' },
      { ...kept, packAddress: {} }, { ...kept, categories: 'Funny' },
      { ...kept, categories: ['unknown'] }, kept,
    ]));
    const next = { name: 'new', url: 'https://x/new.gif', tab: 'gif' as const };
    expect(saveRecentMedia(next)).toEqual([next, kept]);
    expect(loadRecentMedia()).toEqual([next, kept]);
  });

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
