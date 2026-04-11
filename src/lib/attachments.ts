/**
 * Attachment utilities for file uploads.
 *
 * Uploaded files live under `/public/uploads/` and are served as static assets
 * from `/uploads/<name>`. Messages reference them via an absolute URL inserted
 * into the message content (plain URL for images so the existing inline image
 * rendering kicks in, markdown link for generic documents).
 */

// Curated allowlist — everything else is rejected at the API layer.
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

// No compression/transcoding is done — files are written byte-for-byte.
// Per-category caps below are enforced at upload time. `MAX_UPLOAD_BYTES`
// is the overall ceiling used as a fallback and for back-compat.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES; // overall ceiling

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
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
    (ALLOWED_DOC_TYPES as readonly string[]).includes(mime)
  );
}

export function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

export function isVideoMime(mime: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);
}

/**
 * Per-category byte cap. Falls back to the overall ceiling for unknown mimes
 * (which should never hit if `isAllowedMime` passed, but guards the math).
 */
export function maxBytesFor(mime: string): number {
  if (isImageMime(mime)) return MAX_IMAGE_BYTES;
  if (isVideoMime(mime)) return MAX_VIDEO_BYTES;
  if ((ALLOWED_DOC_TYPES as readonly string[]).includes(mime)) return MAX_DOC_BYTES;
  return MAX_UPLOAD_BYTES;
}

/**
 * Does this URL look like a hosted video? Used by MessageContent to hoist
 * video uploads out of the body and render them with <video controls>.
 */
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|ogv)(\?.*)?$/i;
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_REGEX.test(url);
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

/**
 * Is this URL one of our own hosted uploads? Matches both absolute URLs
 * pointing at an /uploads/ path and bare /uploads/ paths.
 */
export function isUploadUrl(url: string): boolean {
  try {
    const u = new URL(url, 'http://local');
    return u.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

export function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url, 'http://local');
    const parts = u.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || 'file');
  } catch {
    return 'file';
  }
}
