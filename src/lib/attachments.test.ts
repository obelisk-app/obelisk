import { describe, it, expect } from 'vitest';
import {
  isAllowedMime,
  isImageMime,
  extensionFor,
  isUploadUrl,
  filenameFromUrl,
  MAX_UPLOAD_BYTES,
} from './attachments';

describe('attachments helpers', () => {
  it('accepts allowed image and doc mimes', () => {
    expect(isAllowedMime('image/png')).toBe(true);
    expect(isAllowedMime('image/jpeg')).toBe(true);
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('application/zip')).toBe(true);
  });

  it('rejects unknown or unsafe mimes', () => {
    expect(isAllowedMime('application/x-msdownload')).toBe(false);
    expect(isAllowedMime('text/html')).toBe(false);
    expect(isAllowedMime('')).toBe(false);
  });

  it('flags image mimes', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
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

  it('enforces a reasonable size ceiling', () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(50 * 1024 * 1024);
  });
});
