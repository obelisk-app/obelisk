/**
 * Attachments: attachments limits. Values the code in
 * `utils/attachments/attachments-limits.ts` reads, kept here so every reader
 * imports the one copy.
 */

import type { UploadLimits } from '@/utils/attachments/attachments-limits';

// Curated allowlist - everything else is rejected at the API layer.
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/ogg',
] as const;

export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', // .mp3
  'audio/ogg',
  'audio/wav',
  'audio/mp4', // .m4a
  'audio/webm',
] as const;

export const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

// No compression/transcoding is done - files are written byte-for-byte.
// Per-category caps below are enforced at upload time. `MAX_UPLOAD_BYTES`
// is the overall ceiling used as a fallback and for back-compat.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

export const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES; // overall ceiling

// Absolute ceiling enforced regardless of per-server overrides, so an
// admin can't accidentally or maliciously configure a 10 GB cap.
export const SERVER_MAX_CEILING = 500 * 1024 * 1024; // 500 MB

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxImageBytes: MAX_IMAGE_BYTES,
  maxVideoBytes: MAX_VIDEO_BYTES,
  maxDocBytes: MAX_DOC_BYTES,
  maxAudioBytes: MAX_AUDIO_BYTES,
  allowedMimes: null,
};
