import { describe, it, expect } from 'vitest';
import {
  isAllowedMime,
  isImageMime,
  isVideoMime,
  extensionFor,
  isUploadUrl,
  isVideoUrl,
  filenameFromUrl,
  maxBytesFor,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOC_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from './attachments';

describe('attachments helpers', () => {
  it('accepts allowed image, video, and doc mimes', () => {
    expect(isAllowedMime('image/png')).toBe(true);
    expect(isAllowedMime('image/jpeg')).toBe(true);
    expect(isAllowedMime('video/mp4')).toBe(true);
    expect(isAllowedMime('video/webm')).toBe(true);
    expect(isAllowedMime('video/quicktime')).toBe(true);
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('application/zip')).toBe(true);
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
