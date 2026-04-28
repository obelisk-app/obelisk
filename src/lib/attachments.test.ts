import { describe, it, expect } from 'vitest';
import {
  isAllowedMime,
  isImageMime,
  isVideoMime,
  isAudioMime,
  extensionFor,
  isUploadUrl,
  isVideoUrl,
  isAudioUrl,
  filenameFromUrl,
  maxBytesFor,
  maxBytesForWithLimits,
  parseServerLimits,
  splitContentForEditing,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOC_BYTES,
  MAX_AUDIO_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  SERVER_MAX_CEILING,
} from './attachments';

describe('attachments helpers', () => {
  it('accepts allowed image, video, audio, and doc mimes', () => {
    expect(isAllowedMime('image/png')).toBe(true);
    expect(isAllowedMime('image/jpeg')).toBe(true);
    expect(isAllowedMime('video/mp4')).toBe(true);
    expect(isAllowedMime('video/webm')).toBe(true);
    expect(isAllowedMime('video/quicktime')).toBe(true);
    expect(isAllowedMime('audio/mpeg')).toBe(true);
    expect(isAllowedMime('audio/ogg')).toBe(true);
    expect(isAllowedMime('audio/mp4')).toBe(true);
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('application/zip')).toBe(true);
  });

  it('flags audio mimes distinctly', () => {
    expect(isAudioMime('audio/mpeg')).toBe(true);
    expect(isAudioMime('audio/ogg')).toBe(true);
    expect(isAudioMime('video/mp4')).toBe(false);
    expect(isAudioMime('image/png')).toBe(false);
  });

  it('detects audio URLs by extension', () => {
    expect(isAudioUrl('https://x.test/uploads/song.mp3')).toBe(true);
    expect(isAudioUrl('/uploads/clip.m4a')).toBe(true);
    expect(isAudioUrl('/uploads/voice.wav?v=2')).toBe(true);
    expect(isAudioUrl('/uploads/photo.png')).toBe(false);
  });

  it('returns the audio byte cap for audio mimes', () => {
    expect(maxBytesFor('audio/mpeg')).toBe(MAX_AUDIO_BYTES);
    expect(MAX_AUDIO_BYTES).toBeGreaterThan(1024 * 1024);
  });

  it('rejects unknown or unsafe mimes', () => {
    expect(isAllowedMime('application/x-msdownload')).toBe(false);
    expect(isAllowedMime('text/html')).toBe(false);
    expect(isAllowedMime('')).toBe(false);
  });

  it('flags image and video mimes', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isImageMime('video/mp4')).toBe(false);
    expect(isVideoMime('video/mp4')).toBe(true);
    expect(isVideoMime('video/webm')).toBe(true);
    expect(isVideoMime('image/png')).toBe(false);
  });

  it('detects video URLs by extension', () => {
    expect(isVideoUrl('https://x.test/uploads/clip.mp4')).toBe(true);
    expect(isVideoUrl('/uploads/clip.webm')).toBe(true);
    expect(isVideoUrl('https://x.test/uploads/movie.mov?v=1')).toBe(true);
    expect(isVideoUrl('https://x.test/uploads/photo.png')).toBe(false);
  });

  it('returns per-category byte caps', () => {
    expect(maxBytesFor('image/png')).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor('video/mp4')).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor('application/pdf')).toBe(MAX_DOC_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });

  it('enforces a per-message attachment cap', () => {
    expect(MAX_ATTACHMENTS_PER_MESSAGE).toBe(10);
  });

  it('maps mime to extension, falling back to filename', () => {
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('application/octet-stream', 'notes.odt')).toBe('odt');
    expect(extensionFor('application/octet-stream')).toBe('bin');
  });

  it('detects upload URLs (absolute and relative)', () => {
    expect(isUploadUrl('http://localhost:3000/uploads/abc.png')).toBe(true);
    expect(isUploadUrl('https://obelisk.example/uploads/doc.pdf')).toBe(true);
    expect(isUploadUrl('/uploads/file.zip')).toBe(true);
    expect(isUploadUrl('https://example.com/foo.png')).toBe(false);
    expect(isUploadUrl('not a url')).toBe(false);
  });

  it('extracts filename from url', () => {
    expect(filenameFromUrl('https://x.test/uploads/abc123.pdf')).toBe('abc123.pdf');
    expect(filenameFromUrl('/uploads/report%20final.pdf')).toBe('report final.pdf');
  });

  it('enforces reasonable per-category size ceilings', () => {
    expect(MAX_IMAGE_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
    expect(MAX_IMAGE_BYTES).toBeLessThanOrEqual(50 * 1024 * 1024);
    expect(MAX_VIDEO_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(MAX_VIDEO_BYTES).toBeLessThanOrEqual(500 * 1024 * 1024);
    expect(MAX_DOC_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
  });
});

describe('parseServerLimits', () => {
  it('falls back to defaults when server fields are missing or invalid', () => {
    const limits = parseServerLimits({
      maxImageBytes: null,
      maxVideoBytes: 0,
      maxDocBytes: -1,
      maxAudioBytes: null,
      allowedMimeTypes: null,
    });
    expect(limits.maxImageBytes).toBe(MAX_IMAGE_BYTES);
    expect(limits.maxVideoBytes).toBe(MAX_VIDEO_BYTES);
    expect(limits.maxDocBytes).toBe(MAX_DOC_BYTES);
    expect(limits.maxAudioBytes).toBe(MAX_AUDIO_BYTES);
    expect(limits.allowedMimes).toBe(null);
  });

  it('uses configured values when within the ceiling', () => {
    const limits = parseServerLimits({
      maxImageBytes: 5 * 1024 * 1024,
      maxVideoBytes: 100 * 1024 * 1024,
      maxDocBytes: 1 * 1024 * 1024,
      maxAudioBytes: 2 * 1024 * 1024,
      allowedMimeTypes: null,
    });
    expect(limits.maxImageBytes).toBe(5 * 1024 * 1024);
    expect(limits.maxVideoBytes).toBe(100 * 1024 * 1024);
    expect(limits.maxDocBytes).toBe(1024 * 1024);
    expect(limits.maxAudioBytes).toBe(2 * 1024 * 1024);
  });

  it('clamps over-ceiling values down to SERVER_MAX_CEILING', () => {
    const limits = parseServerLimits({
      maxImageBytes: SERVER_MAX_CEILING + 1,
      maxVideoBytes: null,
      maxDocBytes: null,
      maxAudioBytes: null,
      allowedMimeTypes: null,
    });
    expect(limits.maxImageBytes).toBe(SERVER_MAX_CEILING);
  });

  it('parses allowedMimeTypes JSON into a Set', () => {
    const limits = parseServerLimits({
      maxImageBytes: null,
      maxVideoBytes: null,
      maxDocBytes: null,
      maxAudioBytes: null,
      allowedMimeTypes: JSON.stringify(['image/png', 'image/jpeg']),
    });
    expect(limits.allowedMimes).toBeInstanceOf(Set);
    expect(limits.allowedMimes?.has('image/png')).toBe(true);
    expect(limits.allowedMimes?.has('video/mp4')).toBe(false);
  });

  it('falls back to null allowedMimes on malformed JSON', () => {
    const limits = parseServerLimits({
      maxImageBytes: null,
      maxVideoBytes: null,
      maxDocBytes: null,
      maxAudioBytes: null,
      allowedMimeTypes: 'not-json',
    });
    expect(limits.allowedMimes).toBe(null);
  });
});

describe('maxBytesForWithLimits', () => {
  it('honors per-category overrides', () => {
    const limits = parseServerLimits({
      maxImageBytes: 1024 * 1024,
      maxVideoBytes: 2 * 1024 * 1024,
      maxDocBytes: 3 * 1024 * 1024,
      maxAudioBytes: 4 * 1024 * 1024,
      allowedMimeTypes: null,
    });
    expect(maxBytesForWithLimits('image/png', limits)).toBe(1024 * 1024);
    expect(maxBytesForWithLimits('video/mp4', limits)).toBe(2 * 1024 * 1024);
    expect(maxBytesForWithLimits('application/pdf', limits)).toBe(3 * 1024 * 1024);
    expect(maxBytesForWithLimits('audio/mpeg', limits)).toBe(4 * 1024 * 1024);
  });
});

describe('splitContentForEditing', () => {
  const HOST = 'https://obelisk.example';

  it('returns content unchanged when no attachments are present', () => {
    const { text, attachments } = splitContentForEditing('just text, no URLs');
    expect(text).toBe('just text, no URLs');
    expect(attachments).toEqual([]);
  });

  it('peels a single image URL off the end of the message body', () => {
    const content = `hello everyone\n${HOST}/uploads/photo.png`;
    const { text, attachments } = splitContentForEditing(content);
    expect(text).toBe('hello everyone');
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      url: `${HOST}/uploads/photo.png`,
      name: 'photo.png',
      isImage: true,
      isVideo: false,
      existing: true,
    });
  });

  it('peels a video URL off the end of the body', () => {
    const content = `look at this ${HOST}/uploads/clip.mp4`;
    const { text, attachments } = splitContentForEditing(content);
    expect(text).toBe('look at this');
    expect(attachments[0]).toMatchObject({ isVideo: true, isImage: false });
  });

  it('recovers a markdown-linked upload as an existing attachment', () => {
    const content = `spec attached: [spec.pdf](${HOST}/uploads/spec.pdf)`;
    const { text, attachments } = splitContentForEditing(content);
    expect(text).toBe('spec attached:');
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      url: `${HOST}/uploads/spec.pdf`,
      name: 'spec.pdf',
      isImage: false,
      isVideo: false,
      existing: true,
    });
  });

  it('leaves external (non-upload) URLs in the text', () => {
    const content = `check https://example.com/blog/post and ${HOST}/uploads/img.png`;
    const { text, attachments } = splitContentForEditing(content);
    expect(text).toContain('https://example.com/blog/post');
    expect(attachments).toHaveLength(1);
    expect(attachments[0].url).toBe(`${HOST}/uploads/img.png`);
  });

  it('handles mixed content: text, mention tokens, image, and doc link', () => {
    const content = `hi nostr:npub1${'a'.repeat(64)}\n${HOST}/uploads/photo.png\n[spec.pdf](${HOST}/uploads/spec.pdf)`;
    const { text, attachments } = splitContentForEditing(content);
    // Mention token must survive (it's not an attachment).
    expect(text).toContain(`nostr:npub1${'a'.repeat(64)}`);
    expect(attachments).toHaveLength(2);
    expect(attachments.map((a) => a.name).sort()).toEqual(['photo.png', 'spec.pdf']);
  });

  it('dedupes the same attachment URL even if it appears twice', () => {
    const url = `${HOST}/uploads/shared.png`;
    const content = `${url}\n${url}`;
    const { text, attachments } = splitContentForEditing(content);
    expect(text).toBe('');
    expect(attachments).toHaveLength(1);
  });
});
