import { describe, expect, it } from 'vitest';
import { aspectRatio, parseImeta, parseImetaTag } from './imeta';

describe('parseImetaTag', () => {
  it('parses the NIP-92 spec example, including multi-word values', () => {
    // Damus's parser splits on every space and requires exactly two tokens,
    // so it discards this entire tag. We must not reproduce that.
    const fields = parseImetaTag([
      'imeta',
      'url https://nostr.build/i/my-image.jpg',
      'm image/jpeg',
      'dim 3024x4032',
      'alt A scenic photo overlooking the coast of Costa Rica',
      'x abc123',
      'fallback https://nostrcheck.me/alt1.jpg',
      'fallback https://cdn.example/alt2.jpg',
    ]);
    expect(fields).toMatchObject({
      url: 'https://nostr.build/i/my-image.jpg',
      mimeType: 'image/jpeg',
      width: 3024,
      height: 4032,
      alt: 'A scenic photo overlooking the coast of Costa Rica',
      sha256: 'abc123',
    });
    // Keys repeat — a flat map would lose one.
    expect(fields?.fallbacks).toHaveLength(2);
  });

  it('reads Amethyst per-image content warnings', () => {
    const fields = parseImetaTag([
      'imeta',
      'url https://cdn.example/a.jpg',
      'content-warning not safe for work',
    ]);
    expect(fields?.contentWarning).toBe('not safe for work');
  });

  it('requires a url', () => {
    expect(parseImetaTag(['imeta', 'm image/jpeg'])).toBeNull();
  });

  it('ignores malformed parts instead of discarding the tag', () => {
    const fields = parseImetaTag([
      'imeta',
      'url https://cdn.example/a.jpg',
      'garbage',
      'dim 100x50',
    ]);
    expect(fields?.width).toBe(100);
  });

  it('ignores a non-numeric dim', () => {
    const fields = parseImetaTag(['imeta', 'url https://a', 'dim widexhigh']);
    expect(fields?.width).toBeNull();
    expect(fields?.height).toBeNull();
  });
});

describe('parseImeta', () => {
  it('keys by url and keeps the first tag per url', () => {
    const map = parseImeta({
      tags: [
        ['imeta', 'url https://a', 'm image/png'],
        ['imeta', 'url https://a', 'm image/gif'],
        ['imeta', 'url https://b', 'm image/jpeg'],
        ['t', 'nostr'],
      ],
    });
    expect(map.size).toBe(2);
    expect(map.get('https://a')?.mimeType).toBe('image/png');
  });
});

describe('aspectRatio', () => {
  it('computes a ratio for layout reservation', () => {
    expect(aspectRatio({ width: 800, height: 400 })).toBe(2);
  });

  it('is null when dimensions are unknown', () => {
    expect(aspectRatio({ width: null, height: 400 })).toBeNull();
  });
});

describe('NIP-71 video fields', () => {
  it('reads the poster frame from `image`', () => {
    const fields = parseImetaTag(['imeta', 'url https://v.example/a.mp4', 'm video/mp4', 'image https://v.example/a.jpg']);
    expect(fields?.poster).toBe('https://v.example/a.jpg');
  });

  it('accepts `thumb`, which some publishers write instead', () => {
    const fields = parseImetaTag(['imeta', 'url https://v.example/a.mp4', 'thumb https://v.example/t.jpg']);
    expect(fields?.poster).toBe('https://v.example/t.jpg');
  });

  it('prefers `image` over `thumb` when both are present', () => {
    const fields = parseImetaTag([
      'imeta', 'url https://v.example/a.mp4',
      'image https://v.example/a.jpg', 'thumb https://v.example/t.jpg',
    ]);
    expect(fields?.poster).toBe('https://v.example/a.jpg');
  });

  it('has no poster when the tag carries none', () => {
    expect(parseImetaTag(['imeta', 'url https://v.example/a.mp4'])?.poster).toBeNull();
  });

  it('reads duration in seconds', () => {
    expect(parseImetaTag(['imeta', 'url https://v.example/a.mp4', 'duration 93'])?.durationSec).toBe(93);
  });

  it('ignores a nonsense duration rather than rendering NaN', () => {
    expect(parseImetaTag(['imeta', 'url https://v.example/a.mp4', 'duration soon'])?.durationSec).toBeNull();
    expect(parseImetaTag(['imeta', 'url https://v.example/a.mp4', 'duration -5'])?.durationSec).toBeNull();
  });
});
