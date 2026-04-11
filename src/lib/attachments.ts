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

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
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
    (ALLOWED_DOC_TYPES as readonly string[]).includes(mime)
  );
}

export function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
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
