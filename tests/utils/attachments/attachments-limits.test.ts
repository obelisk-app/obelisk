import { describe, expect, it } from 'vitest';
import * as limits from '@/utils/attachments/attachments-limits';
import * as entry from '@/utils/attachments/attachments';

describe('attachments-limits', () => {
  it('clamps a server override to the absolute ceiling and ignores nonsense', () => {
    const parsed = limits.parseServerLimits({
      maxImageBytes: 10 * limits.SERVER_MAX_CEILING,
      maxVideoBytes: -1,
      allowedMimeTypes: '{not json',
    });
    expect(parsed.maxImageBytes).toBe(limits.SERVER_MAX_CEILING);
    expect(parsed.maxVideoBytes).toBe(limits.MAX_VIDEO_BYTES);
    expect(parsed.allowedMimes).toBeNull();
  });

  it('picks the per-category cap, with overrides when given', () => {
    expect(limits.maxBytesFor('image/png')).toBe(limits.MAX_IMAGE_BYTES);
    expect(limits.maxBytesFor('application/x-unknown')).toBe(limits.MAX_UPLOAD_BYTES);
    const custom = { ...limits.DEFAULT_UPLOAD_LIMITS, maxDocBytes: 7 };
    expect(limits.maxBytesForWithLimits('application/pdf', custom)).toBe(7);
  });

  it('maps mimes to extensions and falls back to the file name, then bin', () => {
    expect(limits.extensionFor('video/quicktime')).toBe('mov');
    expect(limits.extensionFor('application/x-thing', 'Report.TAR')).toBe('tar');
    expect(limits.extensionFor('application/x-thing')).toBe('bin');
  });

  it('is what the attachments entry point re-exports', () => {
    expect(entry.parseServerLimits).toBe(limits.parseServerLimits);
    expect(entry.isAllowedMime).toBe(limits.isAllowedMime);
    expect(entry.DEFAULT_UPLOAD_LIMITS).toBe(limits.DEFAULT_UPLOAD_LIMITS);
  });
});
