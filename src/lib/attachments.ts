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

// No compression/transcoding is done — files are written byte-for-byte.
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

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxImageBytes: MAX_IMAGE_BYTES,
  maxVideoBytes: MAX_VIDEO_BYTES,
  maxDocBytes: MAX_DOC_BYTES,
  maxAudioBytes: MAX_AUDIO_BYTES,
  allowedMimes: null,
};

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

/**
 * Does this URL look like a hosted video? Used by MessageContent to hoist
 * video uploads out of the body and render them with <video controls>.
 */
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|ogv)(\?.*)?$/i;
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_REGEX.test(url);
}

const AUDIO_EXT_REGEX = /\.(mp3|ogg|oga|wav|m4a|weba)(\?.*)?$/i;
export function isAudioUrl(url: string): boolean {
  return AUDIO_EXT_REGEX.test(url);
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

/**
 * Shape expected by MessageInput's pending attachment strip. Declared here so
 * `splitContentForEditing` can emit it without importing from the component.
 */
export interface PendingAttachment {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
  isAudio?: boolean;
  /**
   * True when this attachment was already stored in the message being edited
   * (rather than freshly uploaded). The input suppresses the upload spinner
   * for these and won't re-upload them — `buildPayload` just re-serializes
   * the existing URL back into the content string on submit.
   */
  existing?: boolean;
  /**
   * True while the file is in flight to /api/upload. `progress` is in [0, 1].
   * These are optional so existing call sites (splitContentForEditing, edit
   * flow) don't need to set them — the UI defaults to "no progress bar".
   */
  uploading?: boolean;
  progress?: number;
}

// Shared URL regex — kept local (instead of importing from markdown.ts) so the
// attachments module has no upward dependency on the chat UI helpers.
const URL_REGEX = /(https?:\/\/[^\s<>)"'\]]+)/g;
const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

/**
 * Parse the content of a message being edited into:
 *   - `text`: content with image, video, and uploaded-doc URLs removed, so the
 *     edit textarea only shows the human-written portion.
 *   - `attachments`: pre-filled `PendingAttachment` entries (flagged
 *     `existing: true`) recreated from the stripped URLs, so they render in
 *     the same attachments strip the composer uses and get re-appended to the
 *     outgoing payload on submit.
 *
 * Docs appear in the message body as `[name](url)` (produced by
 * `MessageInput.buildPayload`). We detect those first, then fall back to
 * extracting raw URLs for images / videos / bare upload links.
 */
export function splitContentForEditing(content: string): {
  text: string;
  attachments: PendingAttachment[];
} {
  const attachments: PendingAttachment[] = [];
  let remaining = content;

  let idCounter = 0;
  const makeId = () => `existing-${++idCounter}`;

  // 1) Match markdown doc links produced by the composer for uploaded files:
  //    `[filename.pdf](https://host/uploads/xyz.pdf)`
  const docLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  remaining = remaining.replace(docLinkRegex, (whole, name: string, url: string) => {
    if (!isUploadUrl(url)) return whole;
    attachments.push({
      id: makeId(),
      url,
      name,
      type: '',
      size: 0,
      isImage: false,
      isVideo: false,
      existing: true,
    });
    return '';
  });

  // 2) Match bare URLs left over: images, videos, or upload links without a label.
  const toStrip = new Set<string>();
  const matches = remaining.match(URL_REGEX) || [];
  for (const url of matches) {
    const isImage = IMAGE_EXT_REGEX.test(url);
    const isVideo = isVideoUrl(url);
    const isUpload = isUploadUrl(url);
    if (!isImage && !isVideo && !isUpload) continue;
    if (toStrip.has(url)) continue;
    toStrip.add(url);
    attachments.push({
      id: makeId(),
      url,
      name: filenameFromUrl(url),
      type: '',
      size: 0,
      isImage,
      isVideo,
      existing: true,
    });
  }
  for (const url of toStrip) {
    remaining = remaining.split(url).join('');
  }

  // Clean up stray whitespace / blank lines left behind by the removals.
  const text = remaining.replace(/\n{3,}/g, '\n\n').trim();

  return { text, attachments };
}
