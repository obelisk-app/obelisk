import { describe, expect, it } from 'vitest';
import { findInvoices, findWelcomeBanner, hoistUrls, stripHoisted } from '@/utils/message-text/hoist';

describe('hoistUrls', () => {
  it('sorts URLs by how they render and keeps only two unique links', () => {
    const content = [
      'https://example.com/a.png',
      'https://example.com/b.mp4',
      'https://example.com/c.mp3',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://one.example/',
      'https://one.example/',
      'https://two.example/',
      'https://three.example/',
    ].join(' ');
    const out = hoistUrls(content, false);
    expect(out.imageUrls).toEqual(['https://example.com/a.png']);
    expect(out.videoUrls).toEqual(['https://example.com/b.mp4']);
    expect(out.audioUrls).toEqual(['https://example.com/c.mp3']);
    expect(out.youtubeUrls).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
    expect(out.linkUrls).toEqual(['https://one.example/', 'https://two.example/']);
  });

  it('hoists nothing from a voice note', () => {
    expect(hoistUrls('https://example.com/a.png', true).imageUrls).toEqual([]);
  });
});

describe('findWelcomeBanner', () => {
  it('matches only our own same-origin route', () => {
    expect(findWelcomeBanner('![hi](/api/welcome-banner?u=1)')).toEqual({
      alt: 'hi',
      src: '/api/welcome-banner?u=1',
      raw: '![hi](/api/welcome-banner?u=1)',
    });
    expect(findWelcomeBanner('![hi](https://evil.example/api/welcome-banner)')).toBeNull();
    expect(findWelcomeBanner('no banner here')).toBeNull();
  });
});

describe('findInvoices', () => {
  it('returns each invoice once, case-insensitively', () => {
    const inv = 'lnbc10u1pj9x7xjpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpusp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qyyssqjcewm5cjwz4a6rfjx77c490yced6pemk0upkxhy89cmm7sct66k8gneanwykzgdrwrfje69h9u5u0w57rrcsysas7gadwmzxc8c6t0spjazup6';
    expect(findInvoices(`${inv} and ${inv.toUpperCase()}`)).toHaveLength(1);
    expect(findInvoices('nothing')).toEqual([]);
  });
});

describe('stripHoisted', () => {
  it('cuts hoisted parts out and collapses the blank lines they leave', () => {
    const marker = `[[game:${'ab'.repeat(32)}]]`;
    const body = stripHoisted(`look\n\n\n\nhttps://x.example/a.png\n\n\n${marker} done`, {
      urls: ['https://x.example/a.png'],
      welcomeBanner: null,
      invoices: [],
      hasGames: true,
    });
    expect(body).toBe('look\n\n done');
  });

  it('removes the welcome banner markdown', () => {
    const raw = '![w](/api/welcome-banner)';
    expect(stripHoisted(`hello ${raw}`, { urls: [], welcomeBanner: { alt: 'w', src: '/api/welcome-banner', raw }, invoices: [], hasGames: false })).toBe('hello');
  });
});
