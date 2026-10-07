/**
 * Attachment upload policy: the mime allowlists, the per-category byte caps,
 * the per-server overrides and the mime-to-extension table. Re-exported from
 * `attachments.ts`, which keeps the URL helpers and the edit-time parser.
 */

import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_DOC_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOC_BYTES,
  MAX_AUDIO_BYTES,
  MAX_UPLOAD_BYTES,
  SERVER_MAX_CEILING,
} from '@/constants/attachments/attachments-limits';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'oga',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/zip': 'zip',
  'application/json': 'json',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function isAllowedMime(mime: string): boolean {
  return (
    (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime) ||
    (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime) ||
    (ALLOWED_AUDIO_TYPES as readonly string[]).includes(mime) ||
    (ALLOWED_DOC_TYPES as readonly string[]).includes(mime)
  );
}

export function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

export function isVideoMime(mime: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);
}

export function isAudioMime(mime: string): boolean {
  return (ALLOWED_AUDIO_TYPES as readonly string[]).includes(mime);
}

/**
 * Per-category byte cap. Falls back to the overall ceiling for unknown mimes
 * (which should never hit if `isAllowedMime` passed, but guards the math).
 */
export function maxBytesFor(mime: string): number {
  if (isImageMime(mime)) return MAX_IMAGE_BYTES;
  if (isVideoMime(mime)) return MAX_VIDEO_BYTES;
  if (isAudioMime(mime)) return MAX_AUDIO_BYTES;
  if ((ALLOWED_DOC_TYPES as readonly string[]).includes(mime)) return MAX_DOC_BYTES;
  return MAX_UPLOAD_BYTES;
}

/**
 * Resolved upload limits for a server. `allowedMimes` null means "use the
 * global allowlist" (the default). Returned by `parseServerLimits()` so
 * callers can apply overrides without re-implementing the clamping logic.
 */
export interface UploadLimits {
  maxImageBytes: number;
  maxVideoBytes: number;
  maxDocBytes: number;
  maxAudioBytes: number;
  allowedMimes: Set<string> | null;
}

/**
 * Build an `UploadLimits` from a Prisma Server row (only the fields we care
 * about). Each byte field is clamped to the absolute ceiling; invalid values
 * fall back to the global constants. `allowedMimeTypes` is parsed as JSON and
 * treated as null (= use global allowlist) if absent or malformed.
 */
export function parseServerLimits(server: {
  maxImageBytes?: number | null;
  maxVideoBytes?: number | null;
  maxDocBytes?: number | null;
  maxAudioBytes?: number | null;
  allowedMimeTypes?: string | null;
}): UploadLimits {
  const clamp = (val: number | null | undefined, fallback: number): number => {
    if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) return fallback;
    return Math.min(val, SERVER_MAX_CEILING);
  };
  let allowedMimes: Set<string> | null = null;
  if (server.allowedMimeTypes) {
    try {
      const parsed = JSON.parse(server.allowedMimeTypes);
      if (Array.isArray(parsed)) {
        const arr = parsed.filter((x): x is string => typeof x === 'string');
        if (arr.length > 0) allowedMimes = new Set(arr);
      }
    } catch {
      // ignore malformed JSON, fall back to global allowlist
    }
  }
  return {
    maxImageBytes: clamp(server.maxImageBytes, MAX_IMAGE_BYTES),
    maxVideoBytes: clamp(server.maxVideoBytes, MAX_VIDEO_BYTES),
    maxDocBytes: clamp(server.maxDocBytes, MAX_DOC_BYTES),
    maxAudioBytes: clamp(server.maxAudioBytes, MAX_AUDIO_BYTES),
    allowedMimes,
  };
}

/**
 * Per-mime cap for an `UploadLimits` object. Analogous to `maxBytesFor` but
 * uses the override values when supplied.
 */
export function maxBytesForWithLimits(mime: string, limits: UploadLimits): number {
  if (isImageMime(mime)) return limits.maxImageBytes;
  if (isVideoMime(mime)) return limits.maxVideoBytes;
  if (isAudioMime(mime)) return limits.maxAudioBytes;
  if ((ALLOWED_DOC_TYPES as readonly string[]).includes(mime)) return limits.maxDocBytes;
  return SERVER_MAX_CEILING;
}

export function extensionFor(mime: string, fallbackName?: string): string {
  const ext = EXT_BY_MIME[mime];
  if (ext) return ext;
  if (fallbackName) {
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(fallbackName);
    if (m) return m[1].toLowerCase();
  }
  return 'bin';
}
