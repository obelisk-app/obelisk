/**
 * Extensions we treat as video when the publisher wrote no `m` field.
 *
 * Without this an `imeta` carrying only a URL rendered through `<img>`, so a
 * video note showed as a broken image rather than a player.
 */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

/** A video by its declared MIME type, or by its URL's extension when none was given. */
export function isVideo(item: { url: string; mimeType?: string | null }): boolean {
  if (item.mimeType) return item.mimeType.startsWith('video/');
  return VIDEO_EXTENSIONS.test(item.url);
}
