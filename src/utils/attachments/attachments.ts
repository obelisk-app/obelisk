/**
 * Attachment utilities for file uploads.
 *
 * Uploaded files live under `./uploads/` (outside `public/` so the Next.js
 * production build does not try to index them at build time) and are served
 * by the route handler at `src/app/uploads/[name]/route.ts` at the URL
 * `/uploads/<name>`. Messages reference them via an absolute URL inserted
 * into the message content (plain URL for images so the existing inline image
 * rendering kicks in, markdown link for generic documents).
 */

export {
  ALLOWED_AUDIO_TYPES,
  ALLOWED_DOC_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  DEFAULT_UPLOAD_LIMITS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_AUDIO_BYTES,
  MAX_DOC_BYTES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  SERVER_MAX_CEILING,
  extensionFor,
  isAllowedMime,
  isAudioMime,
  isImageMime,
  isVideoMime,
  maxBytesFor,
  maxBytesForWithLimits,
  parseServerLimits,
  type UploadLimits,
} from './attachments-limits';

/**
 * Does this URL look like a hosted video? Used by MessageContent to hoist
 * video uploads out of the body and render them with <video controls>.
 * A query or a fragment may follow the extension.
 */
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_REGEX.test(url);
}

/**
 * A video by its declared MIME type, or by its URL's extension when none was
 * given. Without the extension fallback an `imeta` carrying only a URL
 * rendered through `<img>`, so a video note showed as a broken image rather
 * than a player. (The social carousel kept its own extension list for this;
 * it shares `isVideoUrl`'s now, which gained `m4v` and fragments from it.)
 */
export function isVideo(item: { url: string; mimeType?: string | null }): boolean {
  if (item.mimeType) return item.mimeType.startsWith('video/');
  return isVideoUrl(item.url);
}

/** A `.webm` with no picture is a voice note recorded by another client. */
export function isAudioOnlyWebm(url: string, videoWidth: number, duration: number): boolean {
  return /\.webm(?:$|[?#])/i.test(url) && videoWidth === 0 && Number.isFinite(duration);
}

const AUDIO_EXT_REGEX = /\.(mp3|ogg|oga|wav|m4a|weba)(\?.*)?$/i;
export function isAudioUrl(url: string): boolean {
  return AUDIO_EXT_REGEX.test(url);
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
   * for these and won't re-upload them - `buildPayload` just re-serializes
   * the existing URL back into the content string on submit.
   */
  existing?: boolean;
  /**
   * True while the file is in flight to /api/upload. `progress` is in [0, 1].
   * These are optional so existing call sites (splitContentForEditing, edit
   * flow) don't need to set them - the UI defaults to "no progress bar".
   */
  uploading?: boolean;
  progress?: number;
}

// Shared URL regex - kept local (instead of importing from markdown.ts) so the
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
