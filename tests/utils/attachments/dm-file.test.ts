import { describe, expect, it } from 'vitest';
import { buildDmFileTags, dmFileCategory, parseDmFileRumor } from '@/utils/attachments/dm-file';

const base = {
  mimeType: 'image/png',
  algorithm: 'aes-gcm',
  key: 'ab'.repeat(32),
  nonce: 'cd'.repeat(12),
  x: 'ef'.repeat(32),
};

describe('dm-file', () => {
  it('round-trips through tags', () => {
    const tags = buildDmFileTags({ ...base, ox: '01'.repeat(32), size: 1234, dim: { width: 10, height: 20 }, name: 'cat.png' });
    const parsed = parseDmFileRumor('https://blossom.example/abc', tags);
    expect(parsed).toEqual({
      url: 'https://blossom.example/abc',
      ...base,
      ox: '01'.repeat(32),
      size: 1234,
      dim: { width: 10, height: 20 },
      name: 'cat.png',
    });
  });

  it('rejects unsupported algorithms, bad urls and missing keys', () => {
    const tags = buildDmFileTags(base);
    expect(parseDmFileRumor('javascript:alert(1)', tags)).toBeNull();
    expect(parseDmFileRumor('not a url', tags)).toBeNull();
    expect(parseDmFileRumor('https://x/y', tags.map((t) => (t[0] === 'encryption-algorithm' ? [t[0], 'chacha'] : t)))).toBeNull();
    expect(parseDmFileRumor('https://x/y', tags.filter((t) => t[0] !== 'decryption-key'))).toBeNull();
  });

  it('carries a voice-note duration', () => {
    const parsed = parseDmFileRumor('https://x.example/v', buildDmFileTags({ ...base, mimeType: 'audio/webm', durationSeconds: 12.4 }));
    expect(parsed?.durationSeconds).toBe(12);
    expect(parseDmFileRumor('https://x.example/v', buildDmFileTags(base))?.durationSeconds).toBeUndefined();
  });

  it('categorises by mime', () => {
    expect(dmFileCategory('image/jpeg')).toBe('image');
    expect(dmFileCategory('video/mp4')).toBe('video');
    expect(dmFileCategory('audio/ogg')).toBe('audio');
    expect(dmFileCategory('application/pdf')).toBe('file');
  });
});
