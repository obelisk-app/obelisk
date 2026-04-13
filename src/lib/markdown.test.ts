import { describe, it, expect } from 'vitest';
import { preprocessForMarkdown, EVERYONE_PLACEHOLDER, extractUrls, isImageUrl, extractYouTubeId } from './markdown';
import type { MemberInfo } from './mentions';

const members: MemberInfo[] = [
  { pubkey: 'a'.repeat(64), displayName: 'Alice' },
  { pubkey: 'b'.repeat(64), displayName: 'Bob' },
];

describe('preprocessForMarkdown', () => {
  it('returns text unchanged when no mentions', () => {
    const result = preprocessForMarkdown('hello world', members);
    expect(result.text).toBe('hello world');
    expect(result.mentions.size).toBe(0);
  });

  it('replaces mentions with placeholders', () => {
    const content = `hello nostr:npub1${'a'.repeat(64)} how are you`;
    const result = preprocessForMarkdown(content, members);
    expect(result.text).toContain('\u3008MENTION:0\u3009');
    expect(result.text).not.toContain('nostr:npub1');
    expect(result.mentions.get('0')?.displayName).toBe('Alice');
    expect(result.mentions.get('0')?.pubkey).toBe('a'.repeat(64));
  });

  it('handles multiple mentions', () => {
    const content = `nostr:npub1${'a'.repeat(64)} and nostr:npub1${'b'.repeat(64)}`;
    const result = preprocessForMarkdown(content, members);
    expect(result.mentions.size).toBe(2);
    expect(result.mentions.get('0')?.displayName).toBe('Alice');
    expect(result.mentions.get('1')?.displayName).toBe('Bob');
  });

  it('swaps @everyone with the broadcast placeholder', () => {
    const result = preprocessForMarkdown('heads up @everyone!', members);
    expect(result.text).toBe(`heads up ${EVERYONE_PLACEHOLDER}!`);
  });

  it('leaves @everyone untouched when embedded in a word', () => {
    const result = preprocessForMarkdown('@everyones party', members);
    expect(result.text).toBe('@everyones party');
  });

  it('preserves markdown syntax around mentions', () => {
    const content = `**bold** nostr:npub1${'a'.repeat(64)} *italic*`;
    const result = preprocessForMarkdown(content, members);
    expect(result.text).toContain('**bold**');
    expect(result.text).toContain('*italic*');
    expect(result.text).toContain('\u3008MENTION:0\u3009');
  });
});

describe('extractUrls', () => {
  it('extracts URLs from text', () => {
    const urls = extractUrls('check https://example.com and http://foo.bar/baz');
    expect(urls).toEqual(['https://example.com', 'http://foo.bar/baz']);
  });

  it('returns empty for no URLs', () => {
    expect(extractUrls('no links here')).toEqual([]);
  });

  it('deduplicates URLs', () => {
    const urls = extractUrls('https://example.com twice https://example.com');
    expect(urls).toEqual(['https://example.com']);
  });
});

describe('isImageUrl', () => {
  it('detects image URLs', () => {
    expect(isImageUrl('https://example.com/photo.jpg')).toBe(true);
    expect(isImageUrl('https://example.com/photo.PNG')).toBe(true);
    expect(isImageUrl('https://example.com/photo.webp?size=large')).toBe(true);
  });

  it('rejects non-image URLs', () => {
    expect(isImageUrl('https://example.com/page')).toBe(false);
    expect(isImageUrl('https://example.com/file.pdf')).toBe(false);
  });
});

describe('extractYouTubeId', () => {
  it('extracts from watch URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from short URL', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from shorts URL', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for non-YouTube URLs', () => {
    expect(extractYouTubeId('https://example.com')).toBeNull();
  });
});
